import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCostStore } from "@/store/costStore";

type Point = { ts: number; cost: number };

export function CostChart({ points }: { points?: Point[] }) {
  const tx = useCostStore((s) => s.transactions);
  const raw: Point[] =
    points && points.length > 0 ? points : tx.map((t) => ({ ts: t.ts, cost: t.cost }));
  const sorted = [...raw].sort((a, b) => a.ts - b.ts);
  const data = sorted.map((t, i) => ({
    idx: i + 1,
    time: new Date(t.ts).toLocaleString(),
    cost: t.cost,
  }));

  return (
    <div className="h-60 w-full min-h-[240px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="idx" tick={{ fontSize: 10 }} label={{ value: "序", position: "insideBottom", offset: -4 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip labelFormatter={(_, p) => (p?.[0]?.payload?.time as string) ?? ""} />
          <Line type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
