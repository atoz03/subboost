# SubBoost v2.6.3

## 中文

### 更新重点

SubBoost v2.6.3 修复旧配置已迁移但旧字段仍残留时生成重复代理组的问题。

### 主要变化

- 对已有同 ID `migrated-filtered-*` 的代理组复用现有配置，不再追加同名的 `(2)` 副本。
- 保存订阅时会清理旧 `filteredProxyGroups`，防止当前字段与旧字段再次共存。
- 保留旧代理组的筛选条件、组类型、启用状态、顺序和规则目标。

### 升级说明

- 升级前请备份 `.env` 和数据库；自部署升级过程会先保留可恢复的 compose、环境和数据库备份。
- 不需要手动修改数据库。加载和生成会立即去重；下一次保存订阅会清理残留旧字段。
- 数据库 schema 保持兼容，不需要额外迁移步骤。

## English

### Highlights

SubBoost v2.6.3 fixes duplicate proxy groups when a legacy configuration was already migrated but retained its old fields.

### Main Changes

- Existing `migrated-filtered-*` proxy groups are reused instead of appending a same-name `(2)` duplicate.
- Saving a subscription removes legacy `filteredProxyGroups` so old and current fields cannot coexist again.
- Legacy filters, group type, enabled state, ordering, and rule targets remain preserved.

### Upgrade Notes

- Back up `.env` and the database before upgrading; the self-hosted upgrade flow retains recoverable compose, environment, and database backups.
- No manual database changes are required. Loading and generation deduplicate immediately; the next subscription save removes remaining legacy fields.
- The database schema remains compatible and requires no additional migration step.
