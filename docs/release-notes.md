# SubBoost v2.6.2

## 中文

### 更新重点

SubBoost v2.6.2 修复旧版本配置升级后的兼容迁移，确保已保存的代理组和规则配置不会因字段模型更新而在界面或生成结果中消失。

### 主要变化

- 旧 `filteredProxyGroups` 会转换为当前自定义代理组，并保留筛选条件、组类型、启用状态、顺序和规则目标。
- 旧 `moduleRuleOverrides` 和 `moduleRuleExclusions` 会转换为当前自定义规则集与内置规则编辑，保留规则移动、禁用、目标组和排序。
- 旧自定义代理组内的规则会转换为当前自定义规则集；已有新字段优先，不会被旧字段覆盖。
- 旧的 `allRulesOrderEditingEnabled` 界面开关会移除，现有规则顺序保持不变。

### 升级说明

- 升级前请备份 `.env` 和数据库；自部署升级过程会先保留可恢复的 compose、环境和数据库备份。
- 不需要手动修改数据库。首次加载、订阅生成、模板导入和登录状态恢复都会执行兼容迁移，后续保存只写新字段。
- 数据库 schema 保持兼容，不需要额外迁移步骤。

## English

### Highlights

SubBoost v2.6.2 restores compatibility for legacy configuration models so saved proxy groups and rules remain visible and effective after the field-model update.

### Main Changes

- Legacy `filteredProxyGroups` are converted to current custom proxy groups with filters, type, enabled state, ordering, and rule targets preserved.
- Legacy `moduleRuleOverrides` and `moduleRuleExclusions` are converted to current custom rule sets and built-in rule edits, preserving moves, disables, targets, and ordering.
- Rules nested in legacy custom proxy groups are converted to current custom rule sets; existing current-model fields take precedence.
- The removed `allRulesOrderEditingEnabled` UI flag is discarded while the existing rule order remains intact.

### Upgrade Notes

- Back up `.env` and the database before upgrading; the self-hosted upgrade flow retains recoverable compose, environment, and database backups.
- No manual database changes are required. Compatibility migration runs when loading, generating, importing templates, and restoring login state; later saves use only current fields.
- The database schema remains compatible and requires no additional migration step.
