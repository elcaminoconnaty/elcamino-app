"use client";
import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatEUR } from "@/lib/utils";

const COLORS = ["#f5c518", "#1a1a1a", "#d9a800", "#6b6b6b", "#faf3e3", "#3b82f6", "#10b981", "#a855f7"];

export function CostDonut({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <div className="text-sm text-muted-foreground text-center py-8">Sin costos cargados.</div>;
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={((v: any, name: any) => [`${formatEUR(Number(v))} (${((Number(v) / total) * 100).toFixed(1)}%)`, name]) as any}
            contentStyle={{ background: "white", border: "1px solid #e6dcc2", borderRadius: 6, fontSize: 12 }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value, _entry, idx) => {
              const item = data[idx as number];
              const pct = ((item.value / total) * 100).toFixed(0);
              return `${value} — ${pct}%`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
