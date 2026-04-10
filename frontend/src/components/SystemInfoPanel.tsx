import type { SystemSpec } from "../types/benchmark";
import { getVendorBadgeClass, shortSystemName } from "../lib/utils";

interface Props {
  specs: Record<string, SystemSpec>;
  systems: string[];
  activeSystems: Set<string>;
}

export default function SystemInfoPanel({ specs, systems, activeSystems }: Props) {
  const filtered = systems.filter((s) => activeSystems.has(s));

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="section-title">🖥️ 시스템 사양</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((sys) => {
          const spec = specs[sys];
          if (!spec) return null;
          return (
            <div key={sys} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{shortSystemName(sys)}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{spec.Motherboard}</div>
                </div>
                <span className={`badge shrink-0 ${getVendorBadgeClass(spec.Vendor)}`}>{spec.Vendor}</span>
              </div>

              <div className="space-y-1.5">
                {[
                  { icon: "⚡", label: "CPU", value: spec.CPU },
                  { icon: "🧠", label: "Memory", value: spec.Memory },
                  { icon: "💾", label: "Disk", value: spec.Disk },
                  { icon: "🌐", label: "Network", value: spec.Network },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex gap-2 text-xs">
                    <span className="shrink-0 w-5">{icon}</span>
                    <span className="shrink-0 text-slate-400 dark:text-slate-500 w-14">{label}</span>
                    <span className="text-slate-700 dark:text-slate-300 break-all">{value || "N/A"}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-surface-700/50 pt-2.5 space-y-1.5">
                {[
                  { label: "OS", value: spec.OS },
                  { label: "Kernel", value: spec.Kernel },
                  { label: "Compiler", value: spec.Compiler },
                  { label: "FS", value: spec.FileSystem },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-2 text-xs">
                    <span className="shrink-0 text-slate-400 dark:text-slate-500 w-14">{label}</span>
                    <span className="text-slate-600 dark:text-slate-400 font-mono text-[11px] break-all">{value || "N/A"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-surface-700">
              <th className="px-4 py-2.5 text-left text-slate-600 dark:text-slate-400 font-medium">항목</th>
              {filtered.map((sys) => (
                <th key={sys} className="px-3 py-2.5 text-left text-slate-700 dark:text-slate-300 font-medium">
                  {shortSystemName(sys)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["CPU", "Memory", "Disk", "OS", "Kernel", "Compiler"] as (keyof SystemSpec)[]).map((key) => (
              <tr key={key} className="border-b border-slate-100 dark:border-surface-700/30 hover:bg-slate-50 dark:hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-2 text-slate-500">{key}</td>
                {filtered.map((sys) => (
                  <td key={sys} className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                    {specs[sys]?.[key] || "N/A"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
