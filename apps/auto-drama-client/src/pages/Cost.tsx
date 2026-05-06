import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCostStore } from "@/store/costStore";

export function CostPage() {
  const tx = useCostStore((s) => s.transactions);
  const budget = useCostStore((s) => s.budget);
  const total = useCostStore((s) => s.totalCost());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>预算</CardTitle>
            <CardDescription>当前预算（本地持久化）</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {budget.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>累计消耗</CardTitle>
            <CardDescription>本地账本汇总</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">¥ {total.toFixed(2)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>交易明细</CardTitle>
          <CardDescription>来自 `useCostStore().transactions`</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tx.slice().reverse().map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.ts).toLocaleString()}
                  </TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-right">¥ {t.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {tx.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    暂无流水（等 cost-update 事件或手动注入）
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

