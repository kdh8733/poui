import { useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { StressEntry } from "../types/benchmark";
import {
  STRESS_NG_GROUPS,
  STRESS_NG_TESTS,
  SUITE_NAME_TO_TEST_ID,
  type StressNGGroup,
  type StressNGTest,
} from "../data/stressNGGuide";
import { shortSystemName, getSystemColors } from "../lib/utils";

interface Props {
  stressSuites: Record<string, StressEntry[]>;
  activeSystems: Set<string>;
}

export default function StressNGSection({ stressSuites, activeSystems }: Props) {
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<string | null>(null);

  const allSuiteNames = Object.keys(stressSuites);

  const allSystems = useMemo(() => {
    const s = new Set<string>();
    Object.values(stressSuites).forEach((e) => e.forEach((r) => r.results.forEach((x) => s.add(x.system))));
    return [...s].filter((x) => activeSystems.has(x));
  }, [stressSuites, activeSystems]);

  const colors = getSystemColors(allSystems);

  // Map each suite name → group
  const suiteToGroup = useMemo(() => {
    const map: Record<string, StressNGGroup | null> = {};
    for (const name of allSuiteNames) {
      const testId = SUITE_NAME_TO_TEST_ID[name];
      const group = testId ? STRESS_NG_GROUPS.find((g) => g.testIds.includes(testId)) ?? null : null;
      map[name] = group;
    }
    return map;
  }, [allSuiteNames]);

  const filteredSuites = useMemo(() => {
    if (activeGroup === "all") return allSuiteNames;
    return allSuiteNames.filter((n) => suiteToGroup[n]?.id === activeGroup);
  }, [activeGroup, allSuiteNames, suiteToGroup]);

  // Per-group best system aggregation
  const groupScores = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const group of STRESS_NG_GROUPS) {
      const suitesInGroup = allSuiteNames.filter((n) => suiteToGroup[n]?.id === group.id);
      const sysSum: Record<string, { sum: number; count: number }> = {};
      for (const suite of suitesInGroup) {
        const entries = stressSuites[suite] ?? [];
        for (const entry of entries) {
          for (const r of entry.results) {
            if (!activeSystems.has(r.system)) continue;
            if (!sysSum[r.system]) sysSum[r.system] = { sum: 0, count: 0 };
            const maxVal = Math.max(...entry.results.filter((x) => activeSystems.has(x.system)).map((x) => x.value));
            if (maxVal > 0) {
              sysSum[r.system].sum += r.value / maxVal;
              sysSum[r.system].count++;
            }
          }
        }
      }
      result[group.id] = Object.fromEntries(
        Object.entries(sysSum).map(([sys, { sum, count }]) => [sys, count > 0 ? sum / count : 0])
      );
    }
    return result;
  }, [stressSuites, allSuiteNames, suiteToGroup, activeSystems]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="section-title">🔥 Stress-NG 종합 분석</h2>
          <p className="text-xs text-slate-500 mt-0.5">{allSuiteNames.length}개 테스트 · 5개 카테고리</p>
        </div>
      </div>

      {/* Group overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveGroup("all")}
          className={`card p-3 text-left transition-all ${activeGroup === "all" ? "ring-1 ring-brand-500" : "hover:bg-surface-800/50"}`}
        >
          <div className="text-lg mb-1">🔥</div>
          <div className="text-xs font-semibold text-slate-200">전체</div>
          <div className="text-[10px] text-slate-500">{allSuiteNames.length}개</div>
        </button>
        {STRESS_NG_GROUPS.map((group) => {
          const count = allSuiteNames.filter((n) => suiteToGroup[n]?.id === group.id).length;
          const isActive = activeGroup === group.id;
          return (
            <button
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
              className={`card p-3 text-left transition-all ${isActive ? "ring-1 ring-inset" : "hover:bg-surface-800/50"}`}
              style={isActive ? { outline: `1px solid ${group.color}` } : {}}
            >
              <div
                className="w-full h-0.5 rounded-full mb-2"
                style={{ backgroundColor: isActive ? group.color : "#334155" }}
              />
              <div className="text-base mb-1">{group.icon}</div>
              <div className="text-[11px] font-semibold text-slate-200 leading-tight">{group.title}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{count}개 테스트</div>
              {isActive && (
                <div className="mt-2 text-[9px] text-slate-400 leading-relaxed">
                  {group.hwSensitivity[0]}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active group HW sensitivity + radar */}
      {activeGroup !== "all" && (() => {
        const group = STRESS_NG_GROUPS.find((g) => g.id === activeGroup)!;
        const scores = groupScores[group.id];
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

        return (
          <div className="card p-4 space-y-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{group.icon}</span>
                  <span className="font-semibold text-slate-200">{group.titleKo}</span>
                </div>
                <div className="text-xs text-slate-500 mb-3">주요 하드웨어 민감도:</div>
                <ul className="space-y-1">
                  {group.hwSensitivity.map((hw, i) => (
                    <li key={i} className="text-[11px] text-slate-400 flex gap-2">
                      <span className="text-slate-600 shrink-0">•</span>
                      <span>{hw}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-xs text-slate-500 mb-2">카테고리 내 정규화 평균 점수</div>
                {sorted.map(([sys, score], i) => (
                  <div key={sys} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-slate-500 w-4">{i + 1}</span>
                    <div className="flex-1 bg-surface-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${score * 100}%`, backgroundColor: colors[sys] }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-300 w-28 truncate">{shortSystemName(sys)}</span>
                    <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{(score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Suite list */}
      <div className="space-y-2">
        {filteredSuites.map((suiteName) => {
          const entries = stressSuites[suiteName] ?? [];
          const testId = SUITE_NAME_TO_TEST_ID[suiteName];
          const testInfo = testId ? STRESS_NG_TESTS[testId] : null;
          const group = suiteToGroup[suiteName];
          const isExpanded = expandedSuite === suiteName;
          const isGuideOpen = showGuide === suiteName;

          return (
            <SuiteCard
              key={suiteName}
              suiteName={suiteName}
              entries={entries}
              activeSystems={activeSystems}
              colors={colors}
              testInfo={testInfo}
              groupColor={group?.color ?? "#6b7280"}
              groupIcon={group?.icon ?? "📋"}
              expanded={isExpanded}
              guideOpen={isGuideOpen}
              onToggle={() => setExpandedSuite(isExpanded ? null : suiteName)}
              onGuideToggle={() => setShowGuide(isGuideOpen ? null : suiteName)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Suite Card ────────────────────────────────────────────────────────────────

function SuiteCard({
  suiteName,
  entries,
  activeSystems,
  colors,
  testInfo,
  groupColor,
  groupIcon,
  expanded,
  guideOpen,
  onToggle,
  onGuideToggle,
}: {
  suiteName: string;
  entries: StressEntry[];
  activeSystems: Set<string>;
  colors: Record<string, string>;
  testInfo: StressNGTest | null;
  groupColor: string;
  groupIcon: string;
  expanded: boolean;
  guideOpen: boolean;
  onToggle: () => void;
  onGuideToggle: () => void;
}) {
  const filtered = useMemo(
    () => entries.map((e) => ({ ...e, results: e.results.filter((r) => activeSystems.has(r.system)) })).filter((e) => e.results.length > 0),
    [entries, activeSystems]
  );

  const bestPerEntry = useMemo(() =>
    filtered.map((e) => Math.max(...e.results.map((r) => r.value))),
    [filtered]
  );

  const chartOption = useMemo(() => {
    if (!expanded || filtered.length === 0) return null;

    if (filtered.length === 1) {
      const e = filtered[0];
      const sorted = [...e.results].sort((a, b) => b.value - a.value);
      return {
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: "#1e293b", borderColor: "#334155", textStyle: { color: "#e2e8f0", fontSize: 11 } },
        grid: { left: "2%", right: "10%", top: "4%", bottom: "4%", containLabel: true },
        xAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 10 }, splitLine: { lineStyle: { color: "#1e293b" } } },
        yAxis: { type: "category", data: sorted.map((r) => shortSystemName(r.system)), axisLabel: { color: "#94a3b8", fontSize: 11 }, inverse: false },
        series: [{
          type: "bar",
          data: sorted.map((r) => ({ value: +r.value.toFixed(0), itemStyle: { color: colors[r.system], borderRadius: [0, 4, 4, 0] } })),
          barMaxWidth: 24,
          label: { show: true, position: "right", color: "#94a3b8", fontSize: 10, formatter: (p: any) => (p.value >= 1e6 ? `${(p.value/1e6).toFixed(2)}M` : p.value >= 1e3 ? `${(p.value/1e3).toFixed(1)}K` : p.value) + ` ${e.unit}` },
        }],
      };
    }

    // Multi-entry: grouped bar
    const systems = [...new Set(filtered.flatMap((e) => e.results.map((r) => r.system)))].filter((s) => activeSystems.has(s));
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "#1e293b", borderColor: "#334155", textStyle: { color: "#e2e8f0", fontSize: 11 } },
      legend: { data: systems.map((s) => shortSystemName(s)), textStyle: { color: "#94a3b8", fontSize: 10 }, bottom: 0 },
      grid: { left: "2%", right: "2%", top: "4%", bottom: "14%", containLabel: true },
      xAxis: {
        type: "category",
        data: filtered.map((e) => e.test.replace(/stress[-\s]?ng\s*/i, "").replace(/^\s*[-–]\s*/, "").trim().substring(0, 18)),
        axisLabel: { color: "#64748b", fontSize: 9, rotate: 30 },
      },
      yAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 10 }, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: systems.map((sys) => ({
        name: shortSystemName(sys),
        type: "bar",
        data: filtered.map((e) => {
          const r = e.results.find((x) => x.system === sys);
          return r ? +r.value.toFixed(0) : 0;
        }),
        itemStyle: { color: colors[sys] },
        barMaxWidth: 20,
      })),
    };
  }, [expanded, filtered, colors, activeSystems]);

  const chartH = filtered.length === 1
    ? Math.max(100, (filtered[0]?.results?.length ?? 1) * 30 + 40)
    : 260;

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center">
        <button onClick={onToggle} className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface-800/50 transition-colors text-left">
          <div className="w-1 rounded-full self-stretch min-h-[20px]" style={{ backgroundColor: groupColor }} />
          <span className="text-base shrink-0">{groupIcon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{suiteName}</div>
            {testInfo && (
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{testInfo.measure}</div>
            )}
          </div>
          {/* Best system preview */}
          {filtered.length > 0 && (() => {
            const best = filtered.flatMap((e) => e.results).reduce((a, b) => b.value > a.value ? b : a, filtered[0].results[0]);
            return (
              <div className="shrink-0 text-right mr-3">
                <div className="text-[10px] text-slate-500">최고</div>
                <div className="text-[11px] font-mono text-green-400 truncate max-w-[100px]">{shortSystemName(best?.system ?? "")}</div>
              </div>
            );
          })()}
          <span className="text-slate-600 text-xs">{expanded ? "▲" : "▼"}</span>
        </button>

        {/* Guide toggle */}
        {testInfo && (
          <button
            onClick={onGuideToggle}
            className={`px-3 py-3 text-xs transition-colors border-l border-surface-700/30 ${
              guideOpen ? "text-blue-400 bg-blue-500/10" : "text-slate-500 hover:text-slate-300"
            }`}
            title="테스트 가이드 보기"
          >
            ℹ
          </button>
        )}
      </div>

      {/* Guide panel */}
      {guideOpen && testInfo && (
        <div className="border-t border-surface-700/30 bg-surface-800/30 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
          {[
            { label: "측정 대상", value: testInfo.measure },
            { label: "CPU 가속 특징", value: testInfo.cpuFeatures },
            { label: "대표 사용처", value: testInfo.useCases },
            { label: "비교 팁", value: testInfo.tips },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">{label}</div>
              <div className="text-slate-300 leading-relaxed">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {expanded && chartOption && (
        <div className="px-4 pb-4 border-t border-surface-700/30 pt-3">
          <ReactECharts option={chartOption} style={{ height: chartH + "px" }} />
        </div>
      )}

      {/* Ranking mini table when collapsed but enough data */}
      {!expanded && filtered.length > 0 && bestPerEntry.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
          {(() => {
            const allRes = filtered.flatMap((e) => e.results);
            const sysMap: Record<string, number[]> = {};
            allRes.forEach((r) => { (sysMap[r.system] ??= []).push(r.value); });
            const ranked = Object.entries(sysMap)
              .map(([sys, vals]) => ({ sys, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
              .sort((a, b) => b.avg - a.avg);
            return ranked.map((r, i) => (
              <div key={r.sys} className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-600">{i + 1}.</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[r.sys] }} />
                <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{shortSystemName(r.sys)}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
