# Cloudflare Docker Proxy (Multi-Registry Edition)

在维护 HomeServer 或进行云原生开发时，镜像拉取速度和稳定性往往是最大的痛点。本项目是一个高性能、无服务器（Serverless）的解决方案，旨在通过 Cloudflare 全球网络为你的容器环境提供全方位的镜像加速服务。

### 🌟 特色功能
- **多源支持**: 统一代理 Docker Hub, GHCR, Quay, NVCR, AWS ECR 等主流仓库。
- **断点续传**: 完美支持 HTTP Range 请求，解决大体积镜像层拉取中断问题。
- **路径混淆**: 支持 `SECRET_PATH` 混淆前缀，防止你的 Worker 被恶意扫描和“白嫖”。
- **配额优化**: 支持配置 Docker Hub 账号，使用你的会员配额规避匿名频率限制。
- **深度代理**: 智能拦截并代理 302/307 重定向，绕过针对 CDN 域名的封锁。

---

### 🚀 快速部署

1. **Fork 本仓库**。
2. **创建 Cloudflare Worker**:
   - 登录 Cloudflare 控制台 -> Workers & Pages -> Create Application。
   - 将 `index.js` (或代码框中的代码) 粘贴进去。
3. **配置环境变量 (重要)**:
   前往 `Settings` -> `Variables` 添加以下变量：
   | 变量名 | 示例值 | 说明 |
   | :--- | :--- | :--- |
   | `SECRET_PATH` | `my-proxy` | 自定义路径前缀，防止他人扫描使用 |
   | `AUTH_USER` | `docker_user` | (可选) Docker Hub 用户名 |
   | `AUTH_PASS` | `dckr_pat_...` | (可选) Docker Hub 访问令牌 (PAT) |
4. **绑定域名**: 建议绑定自己的自定义域名以获得最稳定的访问体验。

---

### 📖 使用指南

使用代理拉取镜像的标准格式为：

docker pull <你的域名>/v2/<SECRET\_PATH>/<原始仓库地址>/<镜像名>:<标签>

> ​**注意**​：对于 Docker Hub 的官方镜像（如 `alpine`），原始地址请使用 `library`。

#### 1. 基础仓库 (Core Registries)

| **仓库分类** | **原始仓库地址** | **验证命令 (使用代理)**                                                              |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| **Docker Hub**    | `docker.io`        | `docker pull <你的域名>/v2/<SECRET_PATH>/library/alpine:latest`                        |
| **GitHub**        | `ghcr.io`          | `docker pull <你的域名>/v2/<SECRET_PATH>/ghcr.io/home-assistant/home-assistant:stable` |
| **LinuxServer**   | `lscr.io`          | `docker pull <你的域名>/v2/<SECRET_PATH>/lscr.io/linuxserver/transmission:latest`      |

#### 2. 特殊仓库 (Special Registries - 支持 Token 交换)

| **仓库分类** | **原始仓库地址** | **验证命令 (使用代理)**                                                             |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| **NVIDIA**        | `nvcr.io`          | `docker pull <你的域名>/v2/<SECRET_PATH>/nvcr.io/nvidia/k8s-device-plugin:v0.14.1`    |
| **AWS ECR**       | `public.ecr.aws`   | `docker pull <你的域名>/v2/<SECRET_PATH>/public.ecr.aws/docker/library/alpine:latest` |

#### 3. 通用仓库 (Common Registries)

| **仓库分类** | **原始仓库地址**           | **验证命令 (使用代理)**                                                                                             |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Quay.io**       | `quay.io`                    | `docker pull <你的域名>/v2/<SECRET_PATH>/quay.io/coreos/etcd:v3.5.9`                                                  |
| **Google**        | `gcr.io`                     | `docker pull <你的域名>/v2/<SECRET_PATH>/gcr.io/distroless/static-debian11:latest`                                    |
| **Kubernetes**    | `k8s.gcr.io`                 | `docker pull <你的域名>/v2/<SECRET_PATH>/k8s.gcr.io/pause:3.9`                                                        |
| **K8S New**       | `registry.k8s.io`            | `docker pull <你的域名>/v2/<SECRET_PATH>/registry.k8s.io/pause:3.9`                                                   |
| **Microsoft**     | `mcr.microsoft.com`          | `docker pull <你的域名>/v2/<SECRET_PATH>/mcr.microsoft.com/dotnet/runtime-deps:6.0-alpine`                            |
| **Elastic**       | `docker.elastic.co`          | `docker pull <你的域名>/v2/<SECRET_PATH>/docker.elastic.co/elasticsearch/elasticsearch:8.10.2`                        |
| **GitLab**        | `registry.gitlab.com`        | `docker pull <你的域名>/v2/<SECRET_PATH>/registry.gitlab.com/gitlab-org/cluster-integration/auto-deploy-image:latest` |
| **RedHat**        | `registry.access.redhat.com` | `docker pull <你的域名>/v2/<SECRET_PATH>/registry.access.redhat.com/ubi8/ubi-minimal:latest`                          |
