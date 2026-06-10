import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendDatum {
  date: string;
  avgEur: number;
  count: number;
}

const accent = "oklch(0.74 0.18 220)";
const success = "oklch(0.78 0.16 155)";
const muted = "oklch(0.72 0.015 264)";
const border = "oklch(0.32 0.012 264)";
const card = "oklch(0.25 0.012 264)";

export function TrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={288}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke={muted}
          tick={{ fill: muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: border }}
        />
        <YAxis
          yAxisId="price"
          stroke={muted}
          tick={{ fill: muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          stroke={muted}
          tick={{ fill: muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: card,
            border: `1px solid ${border}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: muted }}
          formatter={(value: number, name: string) =>
            name === "Avg price"
              ? [`€${value.toFixed(0)}`, name]
              : [value, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12, color: muted }} />
        <Area
          yAxisId="price"
          type="monotone"
          dataKey="avgEur"
          name="Avg price"
          stroke={accent}
          strokeWidth={2}
          fill="url(#priceFill)"
        />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="Listings"
          stroke={success}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
