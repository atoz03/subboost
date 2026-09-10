import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adapter: null as Record<string, any> | null,
  generateConfig: vi.fn(),
  importTemplateConfig: vi.fn(),
  setState: vi.fn(),
  state: {} as Record<string, any>,
  toast: vi.fn(),
}));

vi.mock("@subboost/ui/product/home/home-surface", () => ({
  HomeSurface: ({ adapter }: { adapter: Record<string, any> }) => {
    mocks.adapter = adapter;
    return React.createElement("main", null, "Home");
  },
}));

vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = Object.assign(
    (selector: (state: Record<string, any>) => unknown) => selector(mocks.state),
    {
      getState: () => mocks.state,
      setState: mocks.setState,
    },
  );
  return { useConfigStore };
});

vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("./home-adapter", () => ({ localHomeAdapter: { loginHref: "/login" } }));

import { buildDefaultSubBoostTemplateConfig } from "@subboost/core/config/defaults";
import { buildConfigTransferDocument } from "@local/lib/config-transfer";
import Page from "./page";

function installDocument() {
  const elements: Array<Record<string, any>> = [];
  vi.stubGlobal("document", {
    body: { appendChild: vi.fn() },
    createElement: vi.fn((tag: string) => {
      const element: Record<string, any> = {
        tag,
        style: {},
        click: vi.fn(),
        remove: vi.fn(),
        files: undefined,
        onchange: null,
      };
      elements.push(element);
      return element;
    }),
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:subboost-config"),
    revokeObjectURL: vi.fn(),
  });
  return elements;
}

async function chooseFile(text: () => Promise<string>) {
  mocks.adapter?.onConfigImport();
  const elements = (document.createElement as ReturnType<typeof vi.fn>).mock.results;
  const input = elements.at(-1)?.value as Record<string, any>;
  input.files = [{ text }];
  await input.onchange();
  return input;
}

describe("local home config transfer controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.adapter = null;
    const config = buildDefaultSubBoostTemplateConfig("minimal");
    mocks.state = {
      ...config,
      nodes: [],
      deletedNodeNames: [],
      deletedNodes: [],
      parseErrors: [],
      sources: [],
      proxyGroupOrder: [],
      listenerPorts: {},
      moduleRuleEditWarningAccepted: false,
      importTemplateConfig: mocks.importTemplateConfig,
      generateConfig: mocks.generateConfig,
    };
    installDocument();
    expect(renderToStaticMarkup(React.createElement(Page))).toBe("<main>Home</main>");
  });

  it("exports the complete local workspace", () => {
    mocks.adapter?.onConfigExport();

    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(anchor).toMatchObject({
      href: "blob:subboost-config",
      download: "subboost-config-transfer.json",
    });
    expect(document.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:subboost-config");
    expect(mocks.toast).toHaveBeenCalledWith({ title: "配置已导出", variant: "success" });
  });

  it("ignores an empty picker and imports template-only and full-workspace files", async () => {
    mocks.adapter?.onConfigImport();
    let input = (document.createElement as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    await input.onchange();
    expect(mocks.importTemplateConfig).not.toHaveBeenCalled();

    const config = buildDefaultSubBoostTemplateConfig("minimal");
    input = await chooseFile(async () => JSON.stringify(config));
    expect(input).toMatchObject({ type: "file", accept: ".json,.yaml,.yml" });
    expect(mocks.importTemplateConfig).toHaveBeenCalledWith(expect.objectContaining({ template: "minimal" }));
    expect(mocks.setState).not.toHaveBeenCalled();

    const documentValue = buildConfigTransferDocument(mocks.state as never);
    await chooseFile(async () => JSON.stringify(documentValue));
    expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({ nodes: [], sources: [] }));
    expect(mocks.generateConfig).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({ title: "配置已导入", variant: "success" });
  });

  it("reports parser and non-Error file failures", async () => {
    await chooseFile(async () => "not: [valid");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));

    await chooseFile(async () => Promise.reject("read failed"));
    expect(mocks.toast).toHaveBeenLastCalledWith({ title: "导入失败", variant: "destructive" });
  });
});
