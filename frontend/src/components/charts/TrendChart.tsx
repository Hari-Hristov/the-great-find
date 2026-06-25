import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
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

function useChartColors(theme: string) {
  return useMemo(() => ({
    accent: cssVar("--color-chart-line-primary"),
    success: cssVar("--color-chart-line-secondary"),
    muted: cssVar("--color-chart-text"),
    border: cssVar("--color-chart-grid"),
    card: cssVar("--color-chart-bg"),
    fillOpacity: theme === "military" ? 0.18 : 0.45,
  }), [theme]);
}

function SparklineTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: TrendDatum }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded border border-[var(--color-chart-grid)] bg-[var(--color-chart-bg)] px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-[var(--color-text-primary)]">{label}</div>
      <div className="flex items-center gap-3">
        <span className="text-[var(--color-chart-text)]">avg</span>
        <span className="tabular-nums text-[var(--color-text-primary)]">€{d.avgEur.toFixed(0)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[var(--color-chart-text)]">listings</span>
        <span className="tabular-nums text-[var(--color-text-primary)]">{d.count}</span>
      </div>
    </div>
  );
}

function MobileSparkline({ data, colors }: { data: TrendDatum[]; colors: ReturnType<typeof useChartColors> }) {
  const first = data[0]?.avgEur ?? 0;
  const last = data[data.length - 1]?.avgEur ?? 0;
  const delta = first > 0 ? ((last - first) / first) * 100 : 0;
  // For a buyer-side operator: prices going DOWN over the period is a
  // success signal (their target is more reachable); UP is a danger signal.
  // Theme-token-backed so the military skin picks up the right hues.
  const trendColor =
    delta <= 0
      ? "text-[var(--color-success)]"
      : "text-[var(--color-danger)]";
  const trendLabel = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const totalCount = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="text-2xl font-semibold tabular-nums text-[var(--color-text-primary)]">
            €{last.toFixed(0)}
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">latest avg price</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className={`text-sm font-medium tabular-nums ${trendColor}`}>{trendLabel}</div>
            <div className="text-xs text-[var(--color-text-muted)]">over period</div>
          </div>
          <div>
            <div className="text-sm font-medium tabular-nums text-[var(--color-text-primary)]">{totalCount}</div>
            <div className="text-xs text-[var(--color-text-muted)]">total listings</div>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis dataKey="date" hide />
          <Tooltip content={<SparklineTooltip />} />
          <Line
            type="monotone"
            dataKey="avgEur"
            stroke={colors.accent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: colors.accent, strokeWidth: 2, fill: colors.card }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Date range */}
      {data.length >= 2 && (
        <div className="flex justify-between px-1 text-[10px] text-[var(--color-text-muted)]">
          <span>{data[0].date}</span>
          <span>{data[data.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  const { theme } = useTheme();
  const colors = useChartColors(theme);

  return (
    <>
      {/* Mobile: sparkline + summary stats */}
      <div className="md:hidden">
        <MobileSparkline data={data} colors={colors} />
      </div>

      {/* Desktop: full dual-axis chart */}
      <div className="hidden md:block">
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
      </div>
    </>
  );
}
