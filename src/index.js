 /**
 * Docker Registry Proxy for Cloudflare Workers
 * * 项目名称: Docker 镜像加速
 * 版本: 1.0
 * * 功能特性:
 * 1. 🌍 多源代理: 统一代理 Docker Hub, GHCR 等主流镜像仓库。
 * 2. 🛡️ 路径混淆: 通过 SECRET_PATH 环境变量实现基础访问控制。
 * 3. ⚡ 速率优化: 支持配置 Docker Hub 账号，规避匿名下载次数限制。
 * 4. 🔗 断点续传: 完美支持 Range 头，解决大体积镜像层下载中断问题。
 * * 部署说明:
 * 1. 在 Cloudflare Worker 设置中添加以下环境变量:
 * - SECRET_PATH: 自定义路径前缀 (默认: mirror)
 * - AUTH_USER: (可选) Docker Hub 用户名
 * - AUTH_PASS: (可选) Docker Hub 密码/Token
 * 2. 绑定自定义域名以获得最佳体验。
 */

// === 仓库地址映射配置 ===
const ROUTES = {
  // 基础仓库
  "docker.io": "https://registry-1.docker.io",
  "ghcr.io": "https://ghcr.io",
  "lscr.io": "https://ghcr.io", 

  // 特殊仓库
  "nvcr.io": "https://nvcr.io",                // NVIDIA
  "public.ecr.aws": "https://public.ecr.aws", // AWS Public ECR

  // 通用仓库
  "quay.io": "https://quay.io",
  "gcr.io": "https://gcr.io",
  "k8s.gcr.io": "https://k8s.gcr.io",
  "registry.k8s.io": "https://registry.k8s.io",
  "mcr.microsoft.com": "https://mcr.microsoft.com",
  "docker.elastic.co": "https://docker.elastic.co",
  "registry.gitlab.com": "https://registry.gitlab.com",
  "registry.access.redhat.com": "https://registry.access.redhat.com"
};

// 特殊仓库的 Token 服务地址映射
const TOKEN_MAP = {
    "ghcr.io": "https://ghcr.io/token",
    "nvcr.io": "https://nvcr.io/proxy_auth",
    "public.ecr.aws": "https://public.ecr.aws/token"
};

const HUB_AUTH = 'auth.docker.io';
const HUB_UPSTREAM = 'registry-1.docker.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const workerDomain = url.hostname;
    let path = url.pathname;

    // 读取环境变量，默认值为 mirror
    const secretPath = env.SECRET_PATH || 'mirror';

    // -----------------------------------------------------------
    // 0. 安全访问控制
    // -----------------------------------------------------------
    if (path === '/v2/' || path === '/v2') {
        return new Response(JSON.stringify({}), { 
            status: 200, 
            headers: { 
                "Docker-Distribution-Api-Version": "registry/2.0",
                "Content-Type": "application/json"
            } 
        });
    }

    if (path !== '/token') {
      const prefix = `/v2/${secretPath}/`;
      if (!path.startsWith(prefix)) {
        return new Response("403 Forbidden", { status: 403 });
      }
      path = path.replace(prefix, '/v2/');
    }

    // -----------------------------------------------------------
    //  1. Docker Hub Token 代理 (处理登录与鉴权)
    // -----------------------------------------------------------
    if (path === '/token') {
      const newUrl = new URL(url);
      newUrl.hostname = HUB_AUTH;
      newUrl.searchParams.set('service', 'registry.docker.io'); 

      const headers = new Headers(request.headers);
      headers.set('Host', HUB_AUTH);

      if (env.AUTH_USER && env.AUTH_PASS) {
        const auth = btoa(`${env.AUTH_USER}:${env.AUTH_PASS}`);
        headers.set('Authorization', `Basic ${auth}`);
      }

      return fetch(newUrl.toString(), {
        method: 'GET',
        headers: headers
      });
    }

    // -----------------------------------------------------------
    // 2. 多源路由解析逻辑
    // -----------------------------------------------------------
    let upstream = "";
    let newPath = path;
    let isDockerHub = false;
    let routeKey = "";

    for (const [key, value] of Object.entries(ROUTES)) {
      if (path.startsWith(`/${key}/`) || path.startsWith(`/v2/${key}/`)) {
        upstream = value;
        routeKey = key;
        if (key === 'lscr.io') routeKey = 'ghcr.io'; // linuxserver 走 GHCR 逻辑

        if (path.startsWith(`/v2/${key}/`)) {
           newPath = path.replace(`/${key}`, "");
        } else {
           newPath = path.substring(key.length + 1);
        }
        break;
      }
    }

    if (upstream === "") {
      upstream = `https://${HUB_UPSTREAM}`;
      isDockerHub = true;
    }

    // -----------------------------------------------------------
    // 3. 请求处理 (智能分流)
    // -----------------------------------------------------------
    
    // === 分支 A: 手动重定向模式 (针对 GHCR, NVCR 等严格源) ===
    // 逻辑：Worker 预先获取 Token -> Worker 发起请求 -> 拦截重定向 -> Worker 代理数据流
    if (TOKEN_MAP[routeKey]) {
        const cleanPath = newPath.replace(/^\/v2\//, '');
        const parts = cleanPath.split('/');
        const repo = `${parts[0]}/${parts[1]}`;
        
        const tokenService = TOKEN_MAP[routeKey];
        const token = await fetchUpstreamToken(tokenService, repo, routeKey);
        
        if (!token) return new Response(`❌ Failed to fetch token for ${routeKey}`, { status: 401 });

        const upstreamUrl = new URL(upstream + newPath + url.search);
        const reqHeaders = new Headers(request.headers);
        reqHeaders.set('Authorization', `Bearer ${token}`);
        reqHeaders.set('User-Agent', 'Docker-Client/19.03.8 (linux)');

        const response = await fetch(upstreamUrl.toString(), {
            method: request.method,
            headers: reqHeaders,
            body: request.body,
            redirect: 'manual' 
        });

        // 拦截 302/307 状态，由 Worker 下载 Blob 数据并透传 Range
        if (response.status === 302 || response.status === 307) {
            const location = response.headers.get('Location');
            if (location) {
                const blobHeaders = new Headers();
                blobHeaders.set('User-Agent', 'Docker-Client/19.03.8 (linux)');
                
                // 如果客户端有 Range 请求，必须透传给上游
                if (request.headers.has('Range')) {
                    blobHeaders.set('Range', request.headers.get('Range'));
                }

                const blobResponse = await fetch(location, {
                    method: 'GET',
                    headers: blobHeaders
                });

                return new Response(blobResponse.body, {
                    status: blobResponse.status, // 200 或 206
                    headers: blobResponse.headers
                });
            }
        }
        return response;
    }

    // === 分支 B: 标准透传模式 (针对 Docker Hub, Quay, GCR 等) ===
    // 逻辑：简单 URL 转换后转发，支持 Redirect Follow
    const newUrl = new URL(upstream + newPath);
    newUrl.search = url.search;
    const newHeaders = new Headers(request.headers);

    const reqInit = {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    };

    const resp = await fetch(newUrl.toString(), reqInit);
    const respHeaders = new Headers(resp.headers);
    respHeaders.set('access-control-allow-origin', '*');
    respHeaders.set('access-control-allow-credentials', 'true');

    if (isDockerHub && resp.status === 401) {
      const authHeader = respHeaders.get('Www-Authenticate');
      if (authHeader) {
        const re = new RegExp(`realm="https://${HUB_AUTH}/token"`, 'gi');
        if (re.test(authHeader)) {
          respHeaders.set('Www-Authenticate', authHeader.replace(re, `realm="https://${workerDomain}/token"`));
        }
      }
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders
    });
  }
};

// === 辅助函数: 获取上游仓库的临时访问 Token ===
async function fetchUpstreamToken(tokenUrl, repo, service) {
  try {
    const targetUrl = `${tokenUrl}?service=${service}&scope=repository:${repo}:pull`;
    const resp = await fetch(targetUrl);
    const data = await resp.json();
    return data.token;
  } catch (e) {
    console.error(`Token fetch failed for ${service}:`, e);
    return null;
  }
}
