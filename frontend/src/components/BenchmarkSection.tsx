import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { BenchmarkData, WorkloadGroup } from "../types/benchmark";
import { shortSystemName, formatValue, getSystemColors } from "../lib/utils";

interface Props {
  group: WorkloadGroup;
  data: BenchmarkData;
  activeSystems: Set<string>;
}

export default function BenchmarkSection({ group, data, activeSystems }: Props) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"charts" | "table">("charts");
  const colors = getSystemColors(data.systems);

  const tests = group.tests.filter((t) => data.tests[t]);

  const toggleAll = () => {
    if (expandedTests.size === tests.length) setExpandedTests(new Set());
    else setExpandedTests(new Set(tests));
  };

  if (tests.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500">
        <div className="text-3xl mb-2">{group.icon}</div>
        <div>이 카테고리에 해당하는 테스트 결과가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{group.icon}</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{group.label}</h2>
            <p className="text-xs text-slate-500">{tests.length}개 테스트</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "charts" ? "table" : "charts")}
            className="btn-ghost text-xs"
          >
            {viewMode === "charts" ? "📋 테이블" : "📊 차트"}
          </button>
          <button onClick={toggleAll} className="btn-ghost text-xs">
            {expandedTests.size === tests.length ? "▲ 모두 접기" : "▼ 모두 펼치기"}
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <TableView tests={tests} data={data} activeSystems={activeSystems} colors={colors} />
      ) : (
        <div className="space-y-3">
          {tests.map((testName) => (
            <TestCard
              key={testName}
              testName={testName}
              testData={data.tests[testName]}
              activeSystems={activeSystems}
              colors={colors}
              expanded={expandedTests.has(testName)}
              onToggle={() => {
                const next = new Set(expandedTests);
                if (next.has(testName)) next.delete(testName);
                else next.add(testName);
                setExpandedTests(next);
              }}
              groupColor={group.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TestCard({
  testName,
  testData,
  activeSystems,
  colors,
  expanded,
  onToggle,
  groupColor,
}: {
  testName: string;
  testData: NonNullable<BenchmarkData["tests"][string]>;
  activeSystems: Set<string>;
  colors: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
  groupColor: string;
}) {
  const filteredResults = testData.results.filter((r) => activeSystems.has(r.system));
  const lowerIsBetter = testData.proportion === "LIB";
  const unit = filteredResults[0]?.unit || "";

  const sorted = [...filteredResults].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value
  );

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const chartOption = useMemo(() => {
    const yLabels = sorted.map((r) => shortSystemName(r.system));
    const barColors = sorted.map((r) =>
      r.system === best?.system ? groupColor : colors[r.system]
    );
    const refValue = lowerIsBetter
      ? Math.min(...filteredResults.map((r) => r.value))
      : Math.max(...filteredResults.map((r) => r.value));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        formatter: (params: any[]) => {
          const p = params[0];
          const r = filteredResults.find((x) => shortSystemName(x.system) === p.name);
          const ratio = refValue > 0 ? (lowerIsBetter ? refValue / (r?.value || 1) : (r?.value || 0) / refValue) : 1;
          let html = `<div style="font-weight:600;margin-bottom:6px">${p.name}</div>`;
          html += `<div>값: <b>${formatValue(r?.value || 0, unit)}</b></div>`;
          if (r?.statistics) {
            html += `<div style="margin-top:4px;font-size:11px;color:#94a3b8">`;
            html += `min: ${formatValue(r.statistics.min, unit)} | max: ${formatValue(r.statistics.max, unit)}`;
            html += `</div>`;
          }
          html += `<div style="font-size:11px;color:#94a3b8">비율: ${ratio.toFixed(3)}x</div>`;
          return html;
        },
      },
      grid: { left: "2%", right: "6%", top: "4%", bottom: "4%", containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        axisLabel: { color: "#94a3b8", fontSize: 11 },
        inverse: false,
      },
      series: [{
        type: "bar",
        data: sorted.map((r, i) => ({
          value: r.value,
          itemStyle: { color: barColors[i], borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: "right",
          color: "#94a3b8",
          fontSize: 10,
          formatter: (p: any) => formatValue(p.value, unit),
        },
      }],
    };
  }, [filteredResults, lowerIsBetter, groupColor, colors, unit]);

  const chartH = Math.max(120, sorted.length * 32 + 40);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/50 transition-colors text-left"
      >
        <div className="w-1 rounded-full self-stretch" style={{ backgroundColor: groupColor, minHeight: 20 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-200 text-sm">{testName}</span>
            <span className="text-xs text-slate-500">{unit}</span>
            <span className={`badge text-[10px] ${lowerIsBetter ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-green-500/20 text-green-400 border-green-500/30"}`}>
              {lowerIsBetter ? "↓ LIB" : "↑ HIB"}
            </span>
          </div>
          {testData.description && (
            <div className="text-xs text-slate-500 truncate mt-0.5">{testData.description}</div>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
          {best && (
            <div className="text-right">
              <div className="text-[10px] text-slate-500">최고</div>
              <div className="font-mono text-green-400">{formatValue(best.value, unit)}</div>
              <div className="text-[10px] text-slate-500">{shortSystemName(best.system)}</div>
            </div>
          )}
          {worst && worst.system !== best?.system && (
            <div className="text-right">
              <div className="text-[10px] text-slate-500">최저</div>
              <div className="font-mono text-red-400">{formatValue(worst.value, unit)}</div>
              <div className="text-[10px] text-slate-500">{shortSystemName(worst.system)}</div>
            </div>
          )}
          <span className="text-slate-600 ml-2">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-700/30 pt-3">
          <ReactECharts option={chartOption} style={{ height: chartH + "px" }} />
        </div>
      )}
    </div>
  );
}

function TableView({
  tests,
  data,
  activeSystems,
  colors,
}: {
  tests: string[];
  data: BenchmarkData;
  activeSystems: Set<string>;
  colors: Record<string, string>;
}) {
  const systems = data.systems.filter((s) => activeSystems.has(s));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700">
            <th className="px-4 py-2 text-left text-slate-400 font-medium">테스트</th>
            <th className="px-3 py-2 text-left text-slate-400 font-medium text-xs">단위</th>
            {systems.map((s) => (
              <th key={s} className="px-3 py-2 text-right font-medium text-xs" style={{ color: colors[s] }}>
                {shortSystemName(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tests.map((testName) => {
            const td = data.tests[testName];
            if (!td) return null;
            const unit = td.results[0]?.unit || "";
            return (
              <tr key={testName} className="border-b border-surface-700/30 hover:bg-surface-800/30">
                <td className="px-4 py-2 text-slate-300 text-xs">{testName}</td>
                <td className="px-3 py-2 text-slate-500 text-xs font-mono">{unit}</td>
                {systems.map((sys) => {
                  const r = td.results.find((x) => x.system === sys);
                  return (
                    <td key={sys} className="px-3 py-2 text-right font-mono text-xs text-slate-300">
                      {r ? formatValue(r.value, unit) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
