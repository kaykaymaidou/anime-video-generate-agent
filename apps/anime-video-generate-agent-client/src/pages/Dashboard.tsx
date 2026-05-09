import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CostChart } from "@/components/Cost/CostChart";
import { useUsageLedgerQuery, useUsageSummaryQuery } from "@/hooks/useUsageQueries";
import { useCostStore } from "@/store/costStore";

export function DashboardPage() {
  const budget = useCostStore((s) => s.budget);
  const summaryQ = useUsageSummaryQuery();
  const ledgerQ = useUsageLedgerQuery(120);

  const serverTotal = summaryQ.data?.totalCost ?? 0;
  const entryCount = summaryQ.data?.entryCount ?? 0;
  const lastAt = summaryQ.data?.lastEntryAt;

  const chartPoints =
    ledgerQ.data?.entries?.map((e) => ({ ts: e.ts, cost: e.cost })) ?? [];

  const loading = summaryQ.isLoading || ledgerQ.isLoading;
  const err = summaryQ.error ?? ledgerQ.error;
  const fetching = summaryQ.isFetching || ledgerQ.isFetching;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Seedance 账单数据来自 Nest <span className="font-mono">/api/usage</span>（方舟任务返回的{" "}
          <span className="font-mono">usage.cost</span>）；约 25 秒自动刷新，生成完成后也会触发同步。
        </p>
        {fetching && !loading && (
          <Badge variant="secondary" className="text-[10px]">
            刷新中…
          </Badge>
        )}
      </div>

      {err && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          用量接口暂不可用：{err instanceof Error ? err.message : String(err)}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>服务状态</CardTitle>
            <CardDescription>Nest 用量账本</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant={loading ? "secondary" : err ? "outline" : "default"}>
              {loading ? "加载中" : err ? "离线" : "已连接"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              累计记录 {entryCount} 条成片消耗
            </span>
          </CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>预算（本地）</CardTitle>
            <CardDescription>在「成本监控」页对照参考</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {budget.toFixed(2)}</CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>累计消耗（服务端）</CardTitle>
            <CardDescription>
              点数合计 ·{" "}
              {lastAt ? `最近 ${new Date(lastAt).toLocaleString()}` : "尚无记录"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{serverTotal.toFixed(4)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>消耗趋势</CardTitle>
          <CardDescription>按成片完成顺序（最近 120 条）</CardDescription>
        </CardHeader>
        <CardContent>
          <CostChart points={chartPoints} />
        </CardContent>
      </Card>
    </div>
  );
}
