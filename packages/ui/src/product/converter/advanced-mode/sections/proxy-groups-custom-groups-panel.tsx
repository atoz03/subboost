"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@subboost/ui/components/ui/button";
import { toast } from "@subboost/ui/components/ui/toaster";
import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { DEFAULT_LOAD_BALANCE_STRATEGY, type LoadBalanceStrategy } from "@subboost/core/types/config";
import { useConfigStore, type CustomProxyGroup } from "@subboost/ui/store/config-store";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import {
  buildManualRuleTargets,
  listCustomRulesForTarget,
  type ProxyGroupRuleTarget,
} from "./proxy-group-rule-targets";
import {
  ProxyGroupManualRuleRow,
  ProxyGroupRuleMoveMenu,
  ProxyGroupRuleSetRow,
  isRuleSetMoveTarget,
  type RuleSetMoveTarget,
} from "./proxy-group-rule-row";
import {
  ProxyGroupTypeMenu,
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
  type ProxyGroupTypeMenuValue,
} from "./proxy-group-type-menu";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  ProxyGroupNameEditor,
  toProxyGroupNameDraft,
  type ProxyGroupNameDraft,
} from "./proxy-group-name-editor";

export function ProxyGroupsCustomGroupsPanel() {
  const {
    enabledProxyGroups,
    hiddenProxyGroups,
    proxyGroupNameOverrides = {},
    customRules = [],
    customRuleSets = [],
    customProxyGroups = [],
    addCustomProxyGroup,
    removeCustomProxyGroup,
    updateCustomProxyGroup,
    updateCustomRule,
    removeCustomRule,
    moveModuleRule,
    removeModuleRule,
    filteredProxyGroups = [],
    dialerProxyGroups = [],
  } = useConfigStore();

  const [expandedCustomGroups, setExpandedCustomGroups] = React.useState<Set<string>>(new Set());
  const [newCustomGroupDraft, setNewCustomGroupDraft] = React.useState<ProxyGroupNameDraft>({
    emoji: "🧩",
    name: "",
  });
  const [newCustomGroupType, setNewCustomGroupType] = React.useState<CustomProxyGroup["groupType"]>("select");
  const [newCustomGroupStrategy, setNewCustomGroupStrategy] =
    React.useState<LoadBalanceStrategy>(DEFAULT_LOAD_BALANCE_STRATEGY);
  const [editingCustomGroupId, setEditingCustomGroupId] = React.useState<string | null>(null);
  const [editingCustomGroupDraft, setEditingCustomGroupDraft] = React.useState<ProxyGroupNameDraft>({
    emoji: "🧩",
    name: "",
  });
  const interactions = useProductInteractionAdapter();

  const getAllGroupNamesForUniqCheck = React.useCallback(() => {
    const names: string[] = [];
    for (const m of PROXY_GROUP_MODULES) {
      names.push(resolveProxyGroupModuleName(m, proxyGroupNameOverrides?.[m.id]));
    }
    for (const g of customProxyGroups) {
      names.push(g.name);
    }
    for (const g of filteredProxyGroups) {
      if (!g || !g.enabled) continue;
      const name = typeof g.name === "string" ? g.name.trim() : "";
      if (!name) continue;
      names.push(name);
    }
    for (const g of dialerProxyGroups) {
      const name = g && typeof g.name === "string" ? g.name.trim() : "";
      if (name) names.push(name);
    }
    return names;
  }, [customProxyGroups, dialerProxyGroups, filteredProxyGroups, proxyGroupNameOverrides]);

  const manualRuleTargets = React.useMemo(
    () =>
      buildManualRuleTargets({
        enabledProxyGroups,
        hiddenProxyGroups,
        customProxyGroups,
        filteredProxyGroups,
        proxyGroupNameOverrides,
      }),
    [customProxyGroups, enabledProxyGroups, filteredProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides],
  );

  const ruleSetMoveTargets = React.useMemo<RuleSetMoveTarget[]>(() => {
    const hidden = new Set(hiddenProxyGroups);
    return [
      ...PROXY_GROUP_MODULES.filter((module) => !hidden.has(module.id)).map((module) => ({
        kind: "module" as const,
        id: module.id,
        name: resolveProxyGroupModuleName(module, proxyGroupNameOverrides?.[module.id]),
      })),
      ...customProxyGroups.map((group) => ({
        kind: "custom" as const,
        id: group.id,
        name: group.name,
      })),
    ];
  }, [customProxyGroups, hiddenProxyGroups, proxyGroupNameOverrides]);

  const moveManualRule = React.useCallback(
    (item: { rule: { id: string }; index: number }, target: ProxyGroupRuleTarget) => {
      updateCustomRule(item.rule.id, { target: target.name });
    },
    [updateCustomRule],
  );

  const moveCustomGroupRuleSet = React.useCallback(
    (sourceGroupId: string, ruleId: string, target: RuleSetMoveTarget) => {
      if (target.kind === "custom" && target.id === sourceGroupId) return;

      const state = useConfigStore.getState();
      const sourceGroup = state.customProxyGroups.find((group) => group.id === sourceGroupId);
      const sourceRule = sourceGroup
        ? state.customRuleSets.find((rule) => rule.id === ruleId && rule.target === sourceGroup.name)
        : null;
      if (!sourceGroup || !sourceRule) return;

      if (target.kind === "custom") {
        const targetGroup = state.customProxyGroups.find((group) => group.id === target.id);
        if (!targetGroup) return;
        if (state.customRuleSets.some((rule) => rule.id === sourceRule.id && rule.target === targetGroup.name)) {
          toast({
            title: "规则集已存在",
            description: "目标分流组里已经有同名规则集，请先移除重复项。",
            variant: "warning",
          });
          return;
        }
      }

      moveModuleRule(sourceGroup.id, ruleId, target);
    },
    [moveModuleRule],
  );

  return (
    <div className="space-y-2">
      {/* 新建自定义分组 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ProxyGroupNameEditor
          value={newCustomGroupDraft}
          onChange={setNewCustomGroupDraft}
          namePlaceholder="自定义分组名称"
        />
        <div className="w-[120px]">
          <ProxyGroupTypeMenu
            value={newCustomGroupType as ProxyGroupTypeMenuValue}
            strategy={newCustomGroupStrategy}
            onChange={({ groupType, strategy }) => {
              setNewCustomGroupType(groupType as CustomProxyGroup["groupType"]);
              if (groupType === "load-balance") {
                setNewCustomGroupStrategy(strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY);
              }
            }}
            triggerClassName="h-7 text-[10px]"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            const draft = toProxyGroupNameDraft(newCustomGroupDraft);
            const full = buildProxyGroupName(draft);
            if (!full) return;
            const emoji = draft.emoji.trim();

            const all = new Set(getAllGroupNamesForUniqCheck());
            if (all.has(full)) {
              toast({
                title: "代理组名称已存在，请换一个名称。",
                variant: "warning",
              });
              return;
            }

            addCustomProxyGroup({
              name: full,
              emoji,
              groupType: newCustomGroupType,
              ...(newCustomGroupType === "load-balance" ? { strategy: newCustomGroupStrategy } : {}),
            });
            interactions.proxyGroupAdded?.({ groupType: newCustomGroupType });
            setNewCustomGroupDraft({ emoji: "🧩", name: "" });
          }}
          title="新增"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 自定义分组列表 */}
      {customProxyGroups.length === 0 ? (
        <div className="text-xs text-white/40 py-3 text-center">暂无自定义分组</div>
      ) : (
        <div className="space-y-1">
          {customProxyGroups.map((group) => {
            const isExpanded = expandedCustomGroups.has(group.id);
            const isEditing = editingCustomGroupId === group.id;
            const manualRules = listCustomRulesForTarget(customRules, group.name);
            const groupRuleSets = customRuleSets.filter((ruleSet) => ruleSet.target === group.name);
            const totalRules = groupRuleSets.length + manualRules.length;
            const typeLabel =
              group.groupType === "load-balance"
                ? `${getProxyGroupTypeLabel(group.groupType)} / ${getLoadBalanceStrategyLabel(
                    group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY,
                  )}`
                : getProxyGroupTypeLabel(group.groupType);

            const toggleExpand = () => {
              setExpandedCustomGroups((prev) => {
                const next = new Set(prev);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              });
            };

            const commitCustomRename = () => {
              const draft = toProxyGroupNameDraft(editingCustomGroupDraft);
              const nextFull = buildProxyGroupName(draft);
              if (!nextFull) return;
              const emoji = draft.emoji.trim();
              const all = new Set(getAllGroupNamesForUniqCheck());
              all.delete(group.name);
              if (all.has(nextFull)) {
                toast({
                  title: "代理组名称已存在，请换一个名称。",
                  variant: "warning",
                });
                return;
              }

              updateCustomProxyGroup(group.id, { name: nextFull, emoji });
              setEditingCustomGroupId(null);
              setEditingCustomGroupDraft({ emoji: "🧩", name: "" });
            };

            return (
              <div key={group.id} className="overflow-hidden rounded border border-white/10 bg-white/5">
                <div
                  className="flex cursor-pointer flex-wrap items-center gap-2 px-2 py-2 transition-colors hover:bg-white/5"
                  onClick={() => {
                    if (!isEditing) toggleExpand();
                  }}
                  title={isExpanded ? "收起" : "展开"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
                  )}
                  <div className="min-w-0 flex-[1_1_180px]">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <ProxyGroupNameEditor
                          value={editingCustomGroupDraft}
                          onChange={setEditingCustomGroupDraft}
                          namePlaceholder="自定义分组名称"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitCustomRename();
                            if (e.key === "Escape") {
                              setEditingCustomGroupId(null);
                              setEditingCustomGroupDraft({ emoji: "🧩", name: "" });
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            commitCustomRename();
                          }}
                          className="h-7 px-2"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomGroupId(null);
                            setEditingCustomGroupDraft({ emoji: "🧩", name: "" });
                          }}
                          className="h-7 px-2"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate" title={group.name}>
                            {group.name}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCustomGroupId(group.id);
                              setEditingCustomGroupDraft(parseProxyGroupNameDraft(group.name, group.emoji || ""));
                            }}
                            title="改名"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="text-[10px] text-white/40 truncate">
                          {`${totalRules} 规则 · ${typeLabel}`}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <div onClick={(e) => e.stopPropagation()}>
                        <ProxyGroupTypeMenu
                          value={group.groupType as ProxyGroupTypeMenuValue}
                          strategy={group.strategy}
                          onChange={({ groupType, strategy }) =>
                            updateCustomProxyGroup(group.id, {
                              groupType: groupType as CustomProxyGroup["groupType"],
                              ...(groupType === "load-balance"
                                ? { strategy: strategy ?? group.strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY }
                                : { strategy: undefined }),
                            })
                          }
                          contentAlign="end"
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-white/35 hover:text-indigo-200"
                              title={`类型：${typeLabel}`}
                              aria-label={`修改 ${group.name} 类型`}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-white/30 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomProxyGroup(group.id);
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="space-y-1 border-t border-white/10 py-1">
                    {totalRules === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-white/40">
                        还没有规则集。可在“搜索规则库”中选择规则后添加到该分组。
                      </p>
                    ) : (
                      <>
                        {groupRuleSets.map((r) => (
                          <ProxyGroupRuleSetRow
                            key={`ruleset:${r.id}`}
                            name={r.name}
                            path={r.path}
                            source="custom"
                            behavior={r.behavior}
                            noResolve={r.noResolve}
                            actions={
                              <>
                                <ProxyGroupRuleMoveMenu
                                  title="移动规则集"
                                  ariaLabel={`移动 ${r.name} 规则集`}
                                  targets={ruleSetMoveTargets}
                                  kinds={["module", "custom"]}
                                  currentTarget={{ kind: "custom", id: group.id, name: group.name }}
                                  onMove={(target) => {
                                    if (isRuleSetMoveTarget(target)) {
                                      moveCustomGroupRuleSet(group.id, r.id, target);
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-white/35 hover:text-red-300"
                                  onClick={() => removeModuleRule(group.id, r.id)}
                                  title="删除规则集"
                                  aria-label={`删除 ${r.name} 规则集`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            }
                          />
                        ))}
                        {manualRules.map((item) => (
                          <ProxyGroupManualRuleRow
                            key={`manual:${item.rule.id}`}
                            item={item}
                            targets={manualRuleTargets}
                            currentTargetName={group.name}
                            onMove={moveManualRule}
                            onRemove={({ index }) => removeCustomRule(index)}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
