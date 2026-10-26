# SubBoost v2.10.0

## 中文

### 更新重点

- 同步上游 v2.9.0 至 v2.10.0：加入明暗主题、订阅链接二维码、MRS 规则集与按名称筛选节点、VLESS XHTTP 和 Hysteria2 导入增强，以及多项协议字段、代理组引用和 YAML 兼容修复。
- 保留本分支的多用户账号、服务端会话与 CSRF 防护、完整配置导入导出、外部 PostgreSQL 部署方式和旧代理组配置迁移。
- `mierus://` 简单分享链接继续可用，并与上游原生 Mieru YAML 支持统一：端口范围绑定只输出 `port-range`，单端口绑定只输出 `port`；继续保留 `traffic-pattern` 和多端口展开。

### 修复

- 旧版本保存的 Mieru 端口范围节点会在读取和保存时自动移除内部 `port`，避免被新的端点校验拒绝或在生成配置时被丢弃。
- 本分支的设置页、登录页和 Mieru 协议标签改用主题色，浅色主题下也能正常显示。

### 升级说明

- Docker 镜像自带新版 Node.js。直接用 Node.js 构建或运行源码时，请使用 Node 24.x（至少 24.22.1）或 Node 26.x（至少 26.12.1）；Node 22 不再支持。
- 继续使用外部 PostgreSQL。升级前请备份 `.env` 和数据库；Prisma 会在启动时应用新增迁移。

## English

### Highlights

- Synced upstream v2.9.0 through v2.10.0, including light and dark themes, subscription-link QR codes, MRS rule sets and name-based node filters, expanded VLESS XHTTP and Hysteria2 imports, and protocol-field, proxy-group reference, and YAML compatibility fixes.
- Preserved this branch's multi-user accounts, server-side sessions with CSRF protection, complete configuration transfer, external PostgreSQL deployment, and legacy proxy-group migration.
- `mierus://` simple share links remain supported and now share upstream's native Mieru YAML model: range bindings emit only `port-range`, single-port bindings emit only `port`, and `traffic-pattern` plus multi-binding expansion are preserved.

### Fixes

- Mieru range nodes saved by earlier versions drop their internal `port` when read or saved, so the new endpoint validation no longer rejects them or removes them from generated configurations.
- This branch's settings page, login page, and Mieru protocol badge use theme colors and render correctly in the light theme.

### Upgrade Notes

- Docker images include the updated Node.js runtime. When building or running source directly with Node.js, use Node 24.x (at least 24.22.1) or Node 26.x (at least 26.12.1); Node 22 is no longer supported.
- External PostgreSQL remains the deployment model. Back up `.env` and the database before upgrading; Prisma applies the new migrations at startup.
