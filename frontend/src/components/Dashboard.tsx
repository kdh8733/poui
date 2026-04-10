import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { BenchmarkData } from "../types/benchmark";
import { shortSystemName, getSystemColors, buildWorkloadGroups, getChartTheme } from "../lib/utils";

interface Props {
  data: BenchmarkData;
  activeSystems: Set<string>;
  isDark: boolean;
}

export default function Dashboard({ data, activeSystems, isDark }: Props) {
  const filtered = data.systems.filter((s) => activeSystems.has(s));
  const colors = getSystemColors(data.systems);
  const groups = buildWorkloadGroups(data);
  const ct = getChartTheme(isDark);

  // Overall avg score bar chart
  const overallOption = useMemo(() => {
    const scores = data.summary
      .filter((s) => activeSystems.has(s.system))
      .sort((a, b) => b.avg - a.avg);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: ct.tooltip.bg,
        borderColor: ct.tooltip.border,
        textStyle: { color: ct.tooltip.text, fontSize: 12 },
        formatter: (params: any[]) => {
          const p = params[0];
          return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>Normalized Avg: <b>${p.value.toFixed(3)}</b>`;
        },
      },
      grid: { left: "2%", right: "4%", top: "4%", bottom: "4%", containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: ct.axis.faint, fontSize: 11 },
        splitLine: { lineStyle: { color: ct.splitLine } },
      },
      yAxis: {
        type: "category",
        data: scores.map((s) => shortSystemName(s.system)),
        axisLabel: { color: ct.axis.label, fontSize: 11 },
        inverse: true,
      },
      series: [{
        type: "bar",
        data: scores.map((s) => ({
          value: +s.avg.toFixed(4),
          itemStyle: { color: colors[s.system], borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 28,
        label: {
          show: true,
          position: "right",
          color: ct.axis.label,
          fontSize: 11,
          formatter: (p: any) => p.value.toFixed(3),
        },
      }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeSystems, colors, isDark]);

  // Radar chart per workload group
  const radarOption = useMemo(() => {
    const nonStressGroups = groups.filter((g) => g.id !== "stressng" && g.id !== "stress" && g.tests.length > 0);
    const indicators = nonStressGroups.map((g) => ({ name: g.label, max: 2.5 }));

    const seriesData = filtered.map((sys) => {
      const scores = data.normalized[sys] || {};
      const values = nonStressGroups.map((g) => {
        const vals = g.tests.map((t) => scores[t]).filter((v): v is number => typeof v === "number" && isFinite(v));
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 1;
      });
      return {
        value: values,
        name: shortSystemName(sys),
        lineStyle: { color: colors[sys], width: 2 },
        areaStyle: { color: colors[sys], opacity: 0.1 },
        itemStyle: { color: colors[sys] },
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: ct.tooltip.bg,
        borderColor: ct.tooltip.border,
        textStyle: { color: ct.tooltip.text, fontSize: 11 },
      },
      legend: {
        data: filtered.map((s) => shortSystemName(s)),
        textStyle: { color: ct.legend, fontSize: 10 },
        bottom: 0,
      },
      radar: {
        indicator: indicators,
        shape: "polygon",
        splitNumber: 4,
        axisName: { color: ct.radar.name, fontSize: 11 },
        splitLine: { lineStyle: { color: ct.radar.splitLine } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: ct.radar.axisLine } },
      },
      series: [{ type: "radar", data: seriesData }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtered, groups, colors, isDark]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "테스트 서버", value: filtered.length, sub: `/ ${data.systems.length}개 전체`, icon: "🖥️" },
          { label: "벤치마크 항목", value: data.testList.length, sub: "개 테스트", icon: "📊" },
          { label: "워크로드 그룹", value: groups.length, sub: "개 카테고리", icon: "📁" },
          { label: "Stress-NG", value: Object.keys(data.stressSuites).length, sub: "개 테스트 슈트", icon: "🔥" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center gap-2">
              <span className="text-xl">{s.icon}</span>
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{s.value}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-4">
          <h2 className="section-title mb-3">📊 전체 정규화 점수 (평균)</h2>
          <ReactECharts option={overallOption} style={{ height: Math.max(180, filtered.length * 36) + "px" }} />
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-3">🕸️ 워크로드별 성능 레이더</h2>
          <ReactECharts option={radarOption} style={{ height: "300px" }} />
        </div>
      </div>

      {/* Best performers */}
      <div className="card p-4">
        <h2 className="section-title mb-3">🏆 워크로드별 최고 성능</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {groups.slice(0, 5).map((g) => {
            const bestEntries = g.tests.flatMap((t) => {
              const test = data.tests[t];
              if (!test) return [];
              const lowerIsBetter = test.proportion === "LIB";
              const filtered2 = test.results.filter((r) => activeSystems.has(r.system));
              if (!filtered2.length) return [];
              const best = filtered2.reduce((a, b) => (lowerIsBetter ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a)));
              return [{ test: t, system: best.system, value: best.value, unit: best.unit }];
            });
            const top = bestEntries[0];
            if (!top) return null;
            return (
              <div key={g.id} className="bg-slate-50 dark:bg-surface-800 rounded-lg p-3 transition-colors duration-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <span>{g.icon}</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{g.label}</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={shortSystemName(top.system)}>
                  {shortSystemName(top.system)}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate" title={top.test}>{top.test}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
