# Cloudflare Docker Proxy (Multi-Registry Edition)

这是一个基于 Cloudflare Workers 编写的轻量级 Docker 镜像加速工具。

### 🌟 特色功能
- **全平台支持**: 统一代理 Docker Hub, GHCR, Quay, NVCR, AWS ECR 等主流仓库。
- **断点续传**: 完美支持 HTTP Range 请求，解决大体积镜像层拉取中断问题。
- **路径隔离**: 支持 `SECRET_PATH` 混淆前缀，防止你的 Worker 被恶意扫描和“白嫖”。
- **配额优化**: 支持配置 Docker Hub 账号，使用你的会员配额规避匿名频率限制。
- **自动重定向**: 智能拦截并代理 302/307 重定向，绕过针对 CDN 域名的封锁。

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

### 📖 使用说明

配置完成后，你可以通过以下格式拉取镜像：

#### 1. 拉取 Docker Hub 镜像
```bash
# 原始命令: docker pull nginx:latest
docker pull <你的域名>/v2/<SECRET_PATH>/nginx:latest
