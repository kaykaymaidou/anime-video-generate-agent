import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUsageLedgerQuery, useUsageSummaryQuery } from "@/hooks/useUsageQueries";
import { useCostStore } from "@/store/costStore";

export function CostPage() {
  const budget = useCostStore((s) => s.budget);
  const summaryQ = useUsageSummaryQuery();
  const ledgerQ = useUsageLedgerQuery(200);

  const serverTotal = summaryQ.data?.totalCost ?? 0;
  const entries = ledgerQ.data?.entries ?? [];
  const loading = summaryQ.isLoading || ledgerQ.isLoading;
  const err = summaryQ.error ?? ledgerQ.error;
  const fetching = summaryQ.isFetching || ledgerQ.isFetching;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          下列为 Seedance 任务成功后记录的方舟 <span className="font-mono">usage.cost</span>（与控制台同源），约 25
          秒轮询刷新。
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>预算（本地）</CardTitle>
            <CardDescription>持久化在浏览器，仅作对照</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {budget.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>累计消耗（服务端）</CardTitle>
            <CardDescription>所有成片账单点数累加</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{serverTotal.toFixed(4)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seedance 消耗明细</CardTitle>
          <CardDescription>最近 {entries.length} 条（单次任务一行）</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>任务</TableHead>
                <TableHead>镜头</TableHead>
                <TableHead>模型</TableHead>
                <TableHead className="text-right">usage.cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                entries.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(t.ts).toLocaleString()}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs" title={t.taskId}>
                      {t.taskId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate font-mono text-xs" title={t.shotId}>
                      {t.shotId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-xs">{t.modelType}</TableCell>
                    <TableCell className="text-right font-mono">{t.cost.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              {!loading && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    暂无记录；在工作区成功生成镜头后，将在此出现账单。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
