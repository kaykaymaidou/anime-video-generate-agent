import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCostStore } from "@/store/costStore";

export function CostChart() {
  const tx = useCostStore((s) => s.transactions);
  const data = tx.map((t) => ({ time: new Date(t.ts).toLocaleTimeString(), cost: t.cost }));

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line dataKey="cost" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

