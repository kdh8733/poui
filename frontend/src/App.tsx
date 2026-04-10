import { useState, useMemo } from "react";
import { useBenchmarkData } from "./hooks/useData";
import { useTheme } from "./hooks/useTheme";
import { buildWorkloadGroups, shortSystemName, getVendorBadgeClass } from "./lib/utils";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import BenchmarkSection from "./components/BenchmarkSection";
import ComparisonMatrix from "./components/ComparisonMatrix";
import StressNGSection from "./components/StressNGSection";
import SystemInfoPanel from "./components/SystemInfoPanel";
import LoadingSpinner from "./components/LoadingSpinner";

export default function App() {
  const { data, error, isLoading, refresh } = useBenchmarkData();
  const { isDark, toggle } = useTheme();
  const [activeSystems, setActiveSystems] = useState<Set<string> | null>(null);
  const [activeSection, setActiveSection] = useState<string>("overview");

  const effectiveSystems = useMemo(() => {
    if (!data) return new Set<string>();
    return activeSystems ?? new Set(data.systems);
  }, [data, activeSystems]);

  const workloadGroups = useMemo(() => (data ? buildWorkloadGroups(data) : []), [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-surface-950 transition-colors duration-200">
        <LoadingSpinner message="벤치마크 데이터 파싱 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-surface-950 transition-colors duration-200">
        <div className="card p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-red-500 dark:text-red-400 mb-2">데이터 로드 실패</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{error.message}</p>
          <button onClick={refresh} className="btn-primary">다시 시도</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sidebarItems = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "systems", label: "System Info", icon: "🖥️" },
    { id: "matrix", label: "Comparison Matrix", icon: "🗂️" },
    ...workloadGroups.map((g) => ({ id: g.id, label: g.label, icon: g.icon })),
    { id: "stressng", label: "Stress-NG", icon: "🔥" },
  ];

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-surface-950 overflow-hidden transition-colors duration-200">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-white dark:bg-surface-900 border-r border-slate-200 dark:border-surface-700/50 overflow-y-auto transition-colors duration-200">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-200 dark:border-surface-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-sm shadow-sm">
              📈
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">POUI</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">Phoronix Analyzer v2</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                activeSection === item.id
                  ? "bg-brand-50 dark:bg-brand-600/20 text-brand-600 dark:text-brand-400"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-800"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-200 dark:border-surface-700/50 space-y-1.5">
          <button onClick={refresh} className="btn-ghost w-full justify-center text-xs">
            🔄 새로고침
          </button>
          <button
            onClick={toggle}
            className="btn-ghost w-full justify-center text-xs"
            title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {isDark ? "☀️ 라이트 모드" : "🌙 다크 모드"}
          </button>
          <div className="text-[10px] text-slate-400 dark:text-slate-600 text-center pt-0.5">
            {new Date(data.generatedAt).toLocaleTimeString("ko-KR")} 기준
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          systems={data.systems}
          specs={data.specs}
          activeSystems={effectiveSystems}
          onSystemsChange={setActiveSystems}
        />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* System filter pills */}
          <div className="flex flex-wrap gap-2">
            {data.systems.map((sys) => {
              const vendor = data.specs[sys]?.Vendor ?? "";
              const isActive = effectiveSystems.has(sys);
              return (
                <button
                  key={sys}
                  onClick={() => {
                    const next = new Set(effectiveSystems);
                    if (isActive && next.size > 1) next.delete(sys);
                    else next.add(sys);
                    setActiveSystems(next);
                  }}
                  className={`badge cursor-pointer transition-all ${
                    isActive
                      ? getVendorBadgeClass(vendor)
                      : "bg-slate-100 dark:bg-surface-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-surface-700"
                  }`}
                >
                  {shortSystemName(sys)}
                </button>
              );
            })}
            <button
              onClick={() => setActiveSystems(new Set(data.systems))}
              className="badge bg-slate-100 dark:bg-surface-800 text-slate-500 border-slate-200 dark:border-surface-700 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              전체 선택
            </button>
          </div>

          {/* Content */}
          {activeSection === "overview" && (
            <Dashboard data={data} activeSystems={effectiveSystems} isDark={isDark} />
          )}
          {activeSection === "systems" && (
            <SystemInfoPanel specs={data.specs} systems={data.systems} activeSystems={effectiveSystems} />
          )}
          {activeSection === "matrix" && (
            <ComparisonMatrix data={data} activeSystems={effectiveSystems} />
          )}
          {activeSection === "stressng" && (
            <StressNGSection stressSuites={data.stressSuites} activeSystems={effectiveSystems} isDark={isDark} />
          )}
          {workloadGroups.map((group) =>
            activeSection === group.id ? (
              <BenchmarkSection
                key={group.id}
                group={group}
                data={data}
                activeSystems={effectiveSystems}
                isDark={isDark}
              />
            ) : null
          )}
        </main>
      </div>
    </div>
  );
}
