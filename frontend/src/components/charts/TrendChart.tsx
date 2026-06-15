import { useMemo } from "react";
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
import { useTheme } from "@/contexts/ThemeContext";

export interface TrendDatum {
  date: string;
  avgEur: number;
  count: number;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  const { theme } = useTheme();

  const colors = useMemo(() => ({
    accent: cssVar("--color-chart-line-primary"),
    success: cssVar("--color-chart-line-secondary"),
    muted: cssVar("--color-chart-text"),
    border: cssVar("--color-chart-grid"),
    card: cssVar("--color-chart-bg"),
    fillOpacity: theme === "military" ? 0.18 : 0.45,
  }), [theme]);

  return (
    <ResponsiveContainer width="100%" height={288}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.accent} stopOpacity={colors.fillOpacity} />
            <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={colors.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          stroke={colors.muted}
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: colors.border }}
        />
        <YAxis
          yAxisId="price"
          stroke={colors.muted}
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          stroke={colors.muted}
          tick={{ fill: colors.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: colors.muted }}
          formatter={(value: number, name: string) =>
            name === "Avg price"
              ? [`€${value.toFixed(0)}`, name]
              : [value, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12, color: colors.muted }} />
        <Area
          yAxisId="price"
          type="monotone"
          dataKey="avgEur"
          name="Avg price"
          stroke={colors.accent}
          strokeWidth={2}
          fill="url(#priceFill)"
        />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="Listings"
          stroke={colors.success}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
