# SubBoost v2.8.1

## 中文

### 更新重点

- 同步上游 v2.7.0 至 v2.8.1：加入持久化节点正则过滤、代理组独立监听端口、解析与生成兼容修复，以及依赖和自托管边界加固。
- 保留本分支的多用户账号、完整配置导入导出、外部 PostgreSQL 部署方式和旧代理组配置迁移。
- 支持导入官方 `mierus://` 简单分享链接，并转换为 Mihomo `mieru` 节点；一个链接包含多个端口绑定时会生成多个节点。

### 修复

- 自部署更新会先验证候选镜像和数据库备份，并在同一次更新中切换到新镜像；失败时保留可恢复的旧配置和备份。
- 已迁移但仍残留旧字段的配置不会再生成重复代理组，保存后会清理旧 `filteredProxyGroups`。

### 升级说明

- 新增 `CRON_SECRET`、`LOCAL_SETUP_TOKEN` 和可选的 `TRUST_PROXY_HEADERS`；安装器会自动生成前两个密钥。
- 继续使用外部 PostgreSQL。升级前请备份 `.env` 和数据库；Prisma 会在启动时应用新增迁移。

## English

### Highlights

- Synced upstream v2.7.0 through v2.8.1, including persistent node-name filters, per-group listener ports, parser and generator compatibility fixes, dependency updates, and self-hosting hardening.
- Preserved this branch's multi-user accounts, complete configuration transfer, external PostgreSQL deployment, and legacy proxy-group migration.
- Added official `mierus://` simple share-link imports. Links with multiple port bindings expand into multiple Mihomo `mieru` nodes.

### Fixes

- Self-hosted updates verify the candidate image and database backup before activation, switch to the new image in the same update, and retain recoverable metadata on failure.
- Migrated configurations with stale legacy fields no longer produce duplicate proxy groups; saving removes `filteredProxyGroups`.

### Upgrade Notes

- `CRON_SECRET`, `LOCAL_SETUP_TOKEN`, and optional `TRUST_PROXY_HEADERS` are now supported; the installer generates the first two secrets.
- External PostgreSQL remains the deployment model. Back up `.env` and the database before upgrading; Prisma applies the new migrations at startup.
