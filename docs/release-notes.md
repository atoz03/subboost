# SubBoost v2.6.1

## 中文

### 更新重点

SubBoost v2.6.1 合并上游 v2.6.0 的代理组、订阅解析和自部署改进，并保留本地多账号、数据库会话、配置导入导出和外部 PostgreSQL 部署能力。

### 主要变化

- 高级代理组支持批量添加或移除全部节点、全部代理组，并可恢复默认成员；批量添加时会跳过可能形成循环引用的项目。
- 代理组成员区域分别显示节点数和代理组数，卡片统计不再把 `DIRECT`、`REJECT` 或代理组引用计入真实节点。
- 改进 Clash/Mihomo YAML 导入兼容性，支持单行对象列表及常见的缩进不一致。
- 修复 VMess、VLESS、Trojan 和 AnyTLS 分享链接中的 ECH 查询服务器名称在转换时丢失的问题。
- 自部署备份在数据库导出失败时安全终止，不再保留不完整备份；保留数量可通过 `SUBBOOST_BACKUP_RETENTION_COUNT` 调整。
- 保留多账号同权登录、账号新增、改名和密码修改功能，并继续按账号隔离订阅与配置数据。
- 保留数据库会话、CSRF 与同源保护，以及外部 PostgreSQL 的单应用容器部署方式。

### 升级说明

- 升级前请备份 `/opt/subboost/.env` 和数据库。
- 本版本包含 v2.5 的代理组模型调整；使用过旧筛选代理组的配置需要迁移到自定义代理组或分流代理组高级模式。
- 多账号数据库结构保持兼容，不需要新增手动迁移步骤。
- 使用外部 PostgreSQL 时，请继续确认 `DATABASE_URL` 可从应用和管理脚本所在环境访问。

## English

### Highlights

SubBoost v2.6.1 integrates the upstream v2.6.0 proxy-group, subscription parsing, and self-hosting improvements while retaining local multi-account authentication, database-backed sessions, configuration import and export, and external PostgreSQL deployment support.

### Main Changes

- Advanced proxy groups can add or remove all nodes or proxy groups in one action and restore default members while avoiding circular references.
- Member summaries distinguish real nodes from proxy-group references and built-in targets such as `DIRECT` and `REJECT`.
- Clash/Mihomo YAML imports accept inline object lists and common indentation inconsistencies.
- ECH query server names are preserved for VMess, VLESS, Trojan, and AnyTLS share links.
- Self-hosted backups stop safely when database export fails, and retention is configurable with `SUBBOOST_BACKUP_RETENTION_COUNT`.
- Peer-level multi-account login, account creation, rename, password updates, and per-account data isolation remain available.
- Database-backed sessions, CSRF and same-origin protection, and the external PostgreSQL single-app deployment model remain available.

### Upgrade Notes

- Back up `/opt/subboost/.env` and the database before upgrading.
- This release includes the v2.5 proxy-group model changes. Migrate legacy filtered proxy groups to custom groups or advanced proxy-group mode.
- The existing multi-account database schema remains compatible and requires no additional manual migration.
- For external PostgreSQL deployments, keep `DATABASE_URL` reachable from both the application and the management script environment.
