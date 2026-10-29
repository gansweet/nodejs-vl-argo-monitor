# Argo Node & VPS Monitor Agent

一个基于 Node.js 构建的高性能一体化节点管理与 VPS 监控工具。集成了 **Xray 多协议代理（支持 Argo 隧道、VLESS Reality、Hysteria2、Socks5）**、**Web 节点展示页面**、**订阅自动同步/ Telegram 推送**、**内置轻量级 VPS 探针监控** 以及 **GitHub Actions 自动化 Docker 镜像构建**。

---

## 📂 项目结构

```text
├── index.js                     # 主入口文件（整合了 Xray 节点管理与 VPS 探针）
├── index.html                   # 根路径访问时的前端展示页面
├── package.json                 # 项目依赖与运行脚本配置
├── .github/
│   └── workflows/
│       └── docker-image.yml     # GitHub Actions 自动化构建与发布 Docker 镜像工作流
└── README.md                    # 项目说明文档
```

---

## ✨ 主要功能特点

- **多协议节点支持**：支持 VLESS（通过 Argo 隧道或 Reality 传输）、VMess、Trojan、Hysteria2 及 Socks5。
- **智能隧道集成**：支持 Cloudflare Argo 隧道（自动获取临时隧道或通过 Token/JSON 配置固定隧道）。
- **VPS 探针监控**：内嵌零依赖的轻量级 VPS 探针，实时采集并上报 CPU、内存、磁盘、网络速率及运行时间。
- **Web UI 与订阅**：内置网页展示，并支持通过自定义路径获取 Base64 节点订阅。
- **自动化运维**：
  - 自动获取服务器公网 IP 及本地 ISP 运营商信息。
  - 支持将节点/订阅地址自动同步到远程订阅聚合平台（Merge-sub）。
  - 支持通过 Telegram Bot 自动推送节点配置。
  - 支持自动访问项目 URL 实现保活。
- **CI/CD 镜像构建**：内置 GitHub Actions 流程，代码推送后自动构建并发布 Docker 镜像。

---

## ⚙️ 环境变量说明

可以在运行环境或 Docker 容器中配置以下环境变量：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` / `SERVER_PORT` | `3000` | HTTP 服务与订阅访问端口 |
| `UUID` | `90ce3ae1-5a6b...` | 节点全局 UUID 标识 |
| `SUB_PATH` | `sgpmnode` | 订阅访问路径（例如：`http://ip:3000/sgpmnode`） |
| `NAME` | `""` | 节点自定义名称前缀 |
| `CFIP` | `saas.sin.fan` | CDN 优选域名或优选 IP（用于 Argo 节点） |
| `CFPORT` | `443` | 优选域名对应的端口 |
| `ARGO_DOMAIN` | `""` | Cloudflare 固定隧道域名（留空即启动临时隧道） |
| `ARGO_AUTH` | `""` | Argo 隧道 Token 或 JSON 密钥 |
| `ARGO_PORT` | `8001` | 本地后端转发端口 |
| `REALITY_PORT` | `""` | VLESS Reality 端口（留空则不开启） |
| `HY2_PORT` | `""` | Hysteria2 端口（留空则不开启） |
| `S5_PORT` | `""` | Socks5 端口（留空则不开启） |
| `UPLOAD_URL` | `""` | 订阅/节点自动同步平台地址（例如：`https://merge.xxx.com`） |
| `PROJECT_URL` | `""` | 当前项目分配的访问 URL（用于保活或聚合订阅） |
| `AUTO_ACCESS` | `false` | 是否开启项目自动保活访问 (`true`/`false`) |
| `BOT_TOKEN` | `""` | Telegram Bot Token |
| `CHAT_ID` | `""` | Telegram 接收消息的 Chat ID |
| `VPS_URL` | `""` | VPS 探针监控面板上报地址 |
| `VPS_ID` | `""` | VPS 探针监控的节点 ID |
| `VPS_KEY` | `""` | VPS 探针监控的 API 密钥 |
| `SHOW_LOG` | `true` | 是否输出运行日志 (`true`/`false`) |

---

## 🚀 快速开始

### 1. 本地直接运行

**环境要求**：Node.js >= 18

```bash
# 安装依赖
npm install

# 启动服务
npm start
# 或直接运行
node index.js
```

### 2. Docker 部署

您可以直接构建并运行本地 Docker 镜像：

```bash
# 构建镜像
docker build -t argo-node .

# 启动容器
docker run -d \
  --name argo-node \
  -p 3000:3000 \
  -e UUID="你的UUID" \
  -e SUB_PATH="sub" \
  argo-node
```

---

## 🔄 CI/CD 自动化构建

项目在 `.github/workflows/docker-image.yml` 中集成了 GitHub Actions 工作流：

- 当代码被推送到 `main` 或 `master` 分支，或发布 Release 时，会自动构建 Docker 镜像并推送至 Docker Hub 或 GitHub Packages (GHCR)。
- 您只需在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中添加如下密钥（依据您的 `docker-image.yml` 配置）：
  - `DOCKERHUB_USERNAME`: Docker Hub 用户名
  - `DOCKERHUB_TOKEN`: Docker Hub Access Token / 密码

---

## 📄 许可协议

本项目基于 [MIT License](LICENSE) 开源。