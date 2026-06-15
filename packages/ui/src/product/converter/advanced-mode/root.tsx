"use client";

import * as React from "react";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { DialerProxyGroupsSection } from "./sections/dialer-proxy-groups-section";
import { DnsSection } from "./sections/dns-section";
import { FilteredProxyGroupsSection } from "./sections/filtered-proxy-groups-section";
import { InputSection } from "./sections/input-section";
import { NodeManagementSection } from "./sections/node-management-section";
import { ProxyGroupsSection } from "./sections/proxy-groups-section";
import { RulesManagementSection } from "./sections/rules-management-section";

type SectionKey = "input" | "filter" | "filtered" | "chain" | "proxy" | "rules" | "dns";

export function AdvancedMode() {
  const [expandedSections, setExpandedSections] = React.useState<Set<SectionKey>>(
    new Set<SectionKey>(["input", "filter", "filtered", "chain", "proxy", "rules", "dns"])
  );

  const toggleSection = (section: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2 pb-2">
      <InputSection isExpanded={expandedSections.has("input")} onToggle={() => toggleSection("input")} />
      <NodeManagementSection
        isExpanded={expandedSections.has("filter")}
        onToggle={() => toggleSection("filter")}
      />
      <FilteredProxyGroupsSection
        isExpanded={expandedSections.has("filtered")}
        onToggle={() => toggleSection("filtered")}
      />
      <DialerProxyGroupsSection isExpanded={expandedSections.has("chain")} onToggle={() => toggleSection("chain")} />
      <ProxyGroupsSection isExpanded={expandedSections.has("proxy")} onToggle={() => toggleSection("proxy")} />
      <RulesManagementSection
        isExpanded={expandedSections.has("rules")}
        onToggle={() => toggleSection("rules")}
      />
      <DnsSection isExpanded={expandedSections.has("dns")} onToggle={() => toggleSection("dns")} />
    </div>
  );
}
