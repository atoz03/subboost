"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { Button } from "@subboost/ui/components/ui/button";
import { isSourcePendingImport } from "@subboost/ui/product/subscription/source-import-state";
import { useConfigStore } from "@subboost/ui/store/config-store";

/**
 * 未保存提醒组件
 * 监听页面离开事件，如果有未保存的更改则提示用户
 */
export function UnsavedPrompt() {
  const { nodes, sources } = useConfigStore(
    useShallow((state) => ({ nodes: state.nodes, sources: state.sources }))
  );
  const [showDialog, setShowDialog] = React.useState(false);
  const [pendingNavigation, setPendingNavigation] = React.useState<string | null>(null);
  const router = useRouter();

  // 检测是否有未保存的更改
  const hasUnsavedChanges = React.useMemo(() => {
    // 有节点但没有生成配置，或者有有效的订阅源但没有解析
    const hasNodes = nodes.length > 0;
    const hasUnparsedSources = sources.some(isSourcePendingImport);
    
    // 如果有节点或未解析的源，但没有下载过配置（这里简化处理）
    return hasNodes || hasUnparsedSources;
  }, [nodes, sources]);

  // 监听 beforeunload 事件（浏览器关闭/刷新）
  React.useEffect(() => {
    // 自动化/测试环境（如 Playwright）下禁用 beforeunload，避免阻塞自动化回归与开发调试
    if (typeof navigator !== "undefined" && (navigator as unknown as { webdriver?: boolean }).webdriver) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "您有未保存的配置更改，确定要离开吗？";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 处理确认离开
  const handleConfirmLeave = () => {
    setShowDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // 处理取消离开
  const handleCancelLeave = () => {
    setShowDialog(false);
    setPendingNavigation(null);
  };

  // 暴露方法供外部调用（如导航拦截）
  React.useEffect(() => {
    // 在全局对象上挂载检查函数
    (window as unknown as { __checkUnsavedChanges?: () => boolean }).__checkUnsavedChanges = () => hasUnsavedChanges;
    
    return () => {
      delete (window as unknown as { __checkUnsavedChanges?: () => boolean }).__checkUnsavedChanges;
    };
  }, [hasUnsavedChanges]);

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            未保存的更改
          </DialogTitle>
          <DialogDescription>
            您有未保存的配置更改。如果现在离开，这些更改将会丢失。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancelLeave}>
            继续编辑
          </Button>
          <Button variant="destructive" onClick={handleConfirmLeave}>
            放弃更改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook: 检查是否有未保存的更改
 */
export function useUnsavedChanges() {
  const { nodes, sources } = useConfigStore(
    useShallow((state) => ({ nodes: state.nodes, sources: state.sources }))
  );
  
  return React.useMemo(() => {
    const hasNodes = nodes.length > 0;
    const hasUnparsedSources = sources.some(isSourcePendingImport);
    return hasNodes || hasUnparsedSources;
  }, [nodes, sources]);
}

