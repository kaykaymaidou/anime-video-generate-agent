import { useCallback, useState } from "react";

export type ScriptOptimizationResult = {
  optimized: string;
  suggestions: string[];
};

/**
 * 剧本优化 Hook（占位）。
 * 后续可在这里调用 Ark/豆包或服务端的优化接口，统一对外返回标准结构。
 */
export function useScriptOptimization() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptOptimizationResult | null>(null);

  const optimize = useCallback(async (script: string) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: 接入 api-client，调用后端优化接口
      const trimmed = script.trim();
      const next: ScriptOptimizationResult = {
        optimized: trimmed,
        suggestions: trimmed ? ["占位：后续接入 Ark 进行结构化建议"] : ["请输入剧本内容"],
      };
      setResult(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "UNKNOWN_ERROR");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, optimize };
}

