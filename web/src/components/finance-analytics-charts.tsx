"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./panel.module.css";
import type { ManualFinanceMovement } from "@/lib/operacoes/repository";

type FinanceAnalyticsChartsProps = {
  movements: ManualFinanceMovement[];
  selectedMonth: string;
};

type DonutSegment = {
  label: string;
  amount: number;
  percentage: number;
  color: string;
};

type DailyFlowPoint = {
  day: number;
  dateLabel: string;
  entries: number;
  expenses: number;
};

const DONUT_COLORS = [
  "#6D28D9",
  "#8B5CF6",
  "#F472B6",
  "#F59E0B",
  "#F9A8D4",
  "#DDD6FE",
];

export function FinanceAnalyticsCharts({
  movements,
  selectedMonth,
}: FinanceAnalyticsChartsProps) {
  const entryDonut = useMemo(
    () => buildDonutSegments(movements, "entrada"),
    [movements],
  );
  const expenseDonut = useMemo(
    () => buildDonutSegments(movements, "saida"),
    [movements],
  );
  const dailyFlow = useMemo(
    () => buildDailyFlowPoints(movements, selectedMonth),
    [movements, selectedMonth],
  );
  const hoveredDefaultIndex = useMemo(() => {
    for (let index = dailyFlow.length - 1; index >= 0; index -= 1) {
      const point = dailyFlow[index];

      if (point && (point.entries > 0 || point.expenses > 0)) {
        return index;
      }
    }

    return 0;
  }, [dailyFlow]);
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number>(hoveredDefaultIndex);

  useEffect(() => {
    setHoveredDayIndex(hoveredDefaultIndex);
  }, [hoveredDefaultIndex]);

  const maxDailyAmount = Math.max(
    1,
    ...dailyFlow.map((point) => Math.max(point.entries, point.expenses)),
  );
  const yAxisSteps = [1, 0.75, 0.5, 0.25, 0];
  const tooltipPoint = dailyFlow[hoveredDayIndex] ?? null;

  return (
    <div className={styles.financeAnalyticsStack}>
      <div className={styles.financeDonutSection}>
        <article className={styles.financeChartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.listTitle}>Entradas por subgrupo</div>
              <p className={styles.sectionSubtitle}>
                Distribuicao automatica das entradas registradas no mes.
              </p>
            </div>
          </div>
          <DonutChart
            centerLabel="ENTRADAS"
            total={entryDonut.total}
            segments={entryDonut.segments}
          />
        </article>

        <article className={styles.financeChartCard}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.listTitle}>Saidas por subgrupo</div>
              <p className={styles.sectionSubtitle}>
                Distribuicao automatica das saidas registradas no mes.
              </p>
            </div>
          </div>
          <DonutChart
            centerLabel="SAIDAS"
            total={expenseDonut.total}
            segments={expenseDonut.segments}
          />
        </article>
      </div>

      <article className={styles.financeChartCard}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.listTitle}>Entradas x Saidas por dia</div>
            <p className={styles.sectionSubtitle}>
              Acompanhe o fluxo diario das movimentacoes da competencia filtrada.
            </p>
          </div>
          <div className={styles.financeBarLegend}>
            <span className={styles.financeBarLegendItem}>
              <span className={`${styles.financeBarLegendDot} ${styles.financeBarLegendDotEntry}`} />
              Entradas
            </span>
            <span className={styles.financeBarLegendItem}>
              <span className={`${styles.financeBarLegendDot} ${styles.financeBarLegendDotExpense}`} />
              Saidas
            </span>
          </div>
        </div>

        <div className={styles.financeBarChart}>
          <div className={styles.financeBarTooltip}>
            {tooltipPoint ? (
              <>
                <strong>{tooltipPoint.dateLabel}</strong>
                <span>Entradas: {formatMoney(tooltipPoint.entries)}</span>
                <span>Saidas: {formatMoney(tooltipPoint.expenses)}</span>
              </>
            ) : (
              <>
                <strong>Movimentacoes do dia</strong>
                <span>Passe o mouse ou toque em uma coluna.</span>
              </>
            )}
          </div>

          <div className={styles.financeBarFrame}>
            {yAxisSteps.map((step) => (
              <div
                key={String(step)}
                className={styles.financeBarGridLine}
                style={{ bottom: `${step * 100}%` }}
              >
                <span>{formatMoney(maxDailyAmount * step)}</span>
              </div>
            ))}

            <div
              className={styles.financeBarColumns}
              style={{
                gridTemplateColumns: `repeat(${String(dailyFlow.length)}, minmax(0, 1fr))`,
              }}
            >
              {dailyFlow.map((point, index) => (
                <button
                  key={point.dateLabel}
                  type="button"
                  className={styles.financeBarDay}
                  onMouseEnter={() => setHoveredDayIndex(index)}
                  onFocus={() => setHoveredDayIndex(index)}
                  onTouchStart={() => setHoveredDayIndex(index)}
                  aria-label={`${point.dateLabel}. Entradas ${formatMoney(point.entries)}. Saidas ${formatMoney(point.expenses)}.`}
                >
                  <span className={styles.financeBarPair}>
                    <span
                      className={`${styles.financeBarColumn} ${styles.financeBarColumnEntry}`}
                      style={getBarStyle(point.entries, maxDailyAmount)}
                    />
                    <span
                      className={`${styles.financeBarColumn} ${styles.financeBarColumnExpense}`}
                      style={getBarStyle(point.expenses, maxDailyAmount)}
                    />
                  </span>
                  <span className={styles.financeBarDayLabel}>
                    {String(point.day).padStart(2, "0")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function DonutChart({
  centerLabel,
  total,
  segments,
}: {
  centerLabel: string;
  total: number;
  segments: DonutSegment[];
}) {
  const radius = 78;
  const strokeWidth = 30;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  return (
    <div className={styles.financeDonutLayout}>
      <div className={styles.financeDonutWrap}>
        <svg viewBox="0 0 220 220" className={styles.financeDonutSvg} aria-hidden="true">
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="rgba(123, 44, 191, 0.08)"
            strokeWidth={strokeWidth}
          />
          {segments.length > 0
            ? segments.map((segment) => {
                const dashLength = (segment.percentage / 100) * circumference;
                const segmentNode = (
                  <circle
                    key={segment.label}
                    cx="110"
                    cy="110"
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="butt"
                    strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                    strokeDashoffset={-currentOffset}
                    transform="rotate(-90 110 110)"
                  />
                );
                currentOffset += dashLength;
                return segmentNode;
              })
            : null}
        </svg>

        <div className={styles.financeDonutCenter}>
          <span>{centerLabel}</span>
          <strong>{formatMoney(total)}</strong>
        </div>
      </div>

      <div className={styles.financeLegendTable}>
        <div className={styles.financeLegendHeader}>
          <span>Subgrupo</span>
          <span>Valor em R$</span>
          <span>% do total</span>
        </div>

        {segments.length > 0 ? (
          segments.map((segment) => (
            <div key={segment.label} className={styles.financeLegendRow}>
              <span className={styles.financeLegendName}>
                <span
                  className={styles.financeLegendDot}
                  style={{ backgroundColor: segment.color }}
                />
                {segment.label}
              </span>
              <strong>{formatMoney(segment.amount)}</strong>
              <span>{formatPercentage(segment.percentage)}</span>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            Nenhuma movimentacao encontrada para montar este grafico.
          </div>
        )}
      </div>
    </div>
  );
}

function buildDonutSegments(
  movements: ManualFinanceMovement[],
  type: ManualFinanceMovement["type"],
) {
  const grouped = new Map<string, number>();

  for (const movement of movements) {
    if (movement.type !== type) {
      continue;
    }

    const subgroupLabel =
      movement.subgroupName.trim() ||
      movement.groupName.trim() ||
      movement.category.trim() ||
      "Sem subgrupo";

    grouped.set(subgroupLabel, (grouped.get(subgroupLabel) ?? 0) + movement.amount);
  }

  const items = Array.from(grouped.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label, "pt-BR"));
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    total,
    segments: items.map((item, index) => ({
      ...item,
      percentage: total > 0 ? (item.amount / total) * 100 : 0,
      color: DONUT_COLORS[index % DONUT_COLORS.length] || DONUT_COLORS[0]!,
    })),
  };
}

function buildDailyFlowPoints(
  movements: ManualFinanceMovement[],
  selectedMonth: string,
): DailyFlowPoint[] {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const month = Number.parseInt(monthText || "", 10);
  const lastDay = new Date(year, month, 0).getDate();
  const byDay = new Map<number, { entries: number; expenses: number }>();

  for (let day = 1; day <= lastDay; day += 1) {
    byDay.set(day, { entries: 0, expenses: 0 });
  }

  for (const movement of movements) {
    const day = Number.parseInt(movement.movementDate.slice(8, 10), 10);

    if (!Number.isFinite(day) || day < 1 || day > lastDay) {
      continue;
    }

    const current = byDay.get(day) ?? { entries: 0, expenses: 0 };

    if (movement.type === "entrada") {
      current.entries += movement.amount;
    } else {
      current.expenses += movement.amount;
    }

    byDay.set(day, current);
  }

  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const values = byDay.get(day) ?? { entries: 0, expenses: 0 };
    const date = new Date(year, month - 1, day);

    return {
      day,
      dateLabel: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date),
      entries: values.entries,
      expenses: values.expenses,
    };
  });
}

function getBarStyle(amount: number, maxAmount: number) {
  if (amount <= 0 || maxAmount <= 0) {
    return { height: "4px" };
  }

  return {
    height: `${Math.max((amount / maxAmount) * 100, 3)}%`,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercentage(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}
