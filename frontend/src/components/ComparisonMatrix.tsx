import { useState, useMemo } from "react";
import type { BenchmarkData } from "../types/benchmark";
import { shortSystemName, getNormalizedColor, buildWorkloadGroups } from "../lib/utils";

interface Props {
  data: BenchmarkData;
  activeSystems: Set<string>;
}

export default function ComparisonMatrix({ data, activeSystems }: Props) {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "avg">("avg");

  const groups = buildWorkloadGroups(data);
  const systems = useMemo(
    () => data.systems.filter((s) => activeSystems.has(s)),
    [data.systems, activeSystems]
  );

  const filteredTests = useMemo(() => {
    if (groupFilter === "all") return data.testList;
    const group = groups.find((g) => g.id === groupFilter);
    return group ? group.tests : data.testList;
  }, [groupFilter, data.testList, groups]);

  const sortedSystems = useMemo(() => {
    if (sortBy === "avg") {
      return [...systems].sort((a, b) => {
        const aAvg = filteredTests.reduce((s, t) => s + (data.normalized[a]?.[t] ?? 0), 0) / filteredTests.length;
        const bAvg = filteredTests.reduce((s, t) => s + (data.normalized[b]?.[t] ?? 0), 0) / filteredTests.length;
        return bAvg - aAvg;
      });
    }
    return [...systems].sort((a, b) => a.localeCompare(b));
  }, [systems, sortBy, filteredTests, data.normalized]);

  const avgScores = useMemo(
    () =>
      Object.fromEntries(
        sortedSystems.map((sys) => {
          const vals = filteredTests.map((t) => data.normalized[sys]?.[t] ?? 0);
          return [sys, vals.reduce((a, b) => a + b, 0) / vals.length];
        })
      ),
    [sortedSystems, filteredTests, data.normalized]
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="section-title">🗂️ 정규화 비교 매트릭스</h2>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">그룹:</span>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-lg px-2 py-1 text-slate-300 text-xs"
            >
              <option value="all">전체</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">정렬:</span>
            <button
              onClick={() => setSortBy(sortBy === "avg" ? "name" : "avg")}
              className="btn-ghost"
            >
              {sortBy === "avg" ? "점수순" : "이름순"}
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
        {[
          { color: "#fca5a5", label: "1.00 (기준)" },
          { color: "#fdba74", label: "1.01 ~ 1.49" },
          { color: "#93c5fd", label: "1.50 ~ 1.99" },
          { color: "#86efac", label: "≥ 2.00" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color, opacity: 0.7 }} />
            <span>{item.label}</span>
          </div>
        ))}
        <span className="text-slate-600 ml-2">최저값 기준 정규화 (낮을수록 = 1.0)</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="px-3 py-2.5 text-left text-slate-400 font-medium sticky left-0 bg-surface-900 z-10 min-w-[200px]">
                테스트
              </th>
              {sortedSystems.map((sys) => (
                <th key={sys} className="px-2 py-2.5 text-center font-medium text-slate-300 min-w-[100px]">
                  <div className="whitespace-nowrap">{shortSystemName(sys)}</div>
                  <div className="text-[10px] text-slate-500 font-normal">{data.specs[sys]?.Vendor}</div>
                </th>
              ))}
            </tr>
            {/* Average row */}
            <tr className="border-b border-surface-700 bg-surface-800/50">
              <td className="px-3 py-2 sticky left-0 bg-surface-800/80 font-semibold text-slate-300">
                📊 평균 점수
              </td>
              {sortedSystems.map((sys) => (
                <td key={sys} className="px-2 py-2 text-center font-mono font-semibold text-slate-200">
                  {avgScores[sys].toFixed(3)}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTests.map((testName, idx) => {
              const td = data.tests[testName];
              return (
                <tr
                  key={testName}
                  className={`border-b border-surface-700/30 hover:bg-surface-800/30 transition-colors ${idx % 2 === 0 ? "" : "bg-surface-800/10"}`}
                >
                  <td
                    className="px-3 py-2 text-slate-400 sticky left-0 bg-surface-900 hover:bg-surface-800 z-10 border-r border-surface-700/30"
                    title={td?.description}
                  >
                    <div className="truncate max-w-[200px]">{testName}</div>
                    {td?.proportion === "LIB" && <span className="text-[9px] text-orange-400">↓LIB</span>}
                  </td>
                  {sortedSystems.map((sys) => {
                    const score = data.normalized[sys]?.[testName];
                    if (score == null) return <td key={sys} className="px-2 py-2 text-center text-slate-600">—</td>;
                    const bg = getNormalizedColor(score);
                    return (
                      <td key={sys} className="px-2 py-2 text-center font-mono">
                        <div
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: bg + "30", color: bg, border: `1px solid ${bg}40` }}
                        >
                          {score.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
