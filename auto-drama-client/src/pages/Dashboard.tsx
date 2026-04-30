import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CostChart } from "@/components/Cost/CostChart";
import { useCostStore } from "@/store/costStore";

export function DashboardPage() {
  const total = useCostStore((s) => s.totalCost());
  const budget = useCostStore((s) => s.budget);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>状态</CardTitle>
            <CardDescription>当前为本地开发模式</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge variant="secondary">DEV</Badge>
            <span className="text-sm text-muted-foreground">Socket / API 将在后端就绪后接入</span>
          </CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>预算</CardTitle>
            <CardDescription>可在成本模块里调整</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {budget.toFixed(2)}</CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>累计消耗</CardTitle>
            <CardDescription>来自本地成本账本</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {total.toFixed(2)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>成本趋势</CardTitle>
          <CardDescription>演示折线（真实数据来自 cost-update 事件）</CardDescription>
        </CardHeader>
        <CardContent>
          <CostChart />
        </CardContent>
      </Card>
    </div>
  );
}

