import { getVendorBadgeClass, shortSystemName } from "../lib/utils";
import type { SystemSpec } from "../types/benchmark";

interface Props {
  systems: string[];
  specs: Record<string, SystemSpec>;
  activeSystems: Set<string>;
  onChange: (s: Set<string>) => void;
}

export default function SystemSelector({ systems, specs, activeSystems, onChange }: Props) {
  const vendors = [...new Set(systems.map((s) => specs[s]?.Vendor || "Unknown"))];

  const toggleVendor = (vendor: string) => {
    const vendorSystems = systems.filter((s) => specs[s]?.Vendor === vendor);
    const allActive = vendorSystems.every((s) => activeSystems.has(s));
    const next = new Set(activeSystems);
    if (allActive) {
      vendorSystems.forEach((s) => { if (next.size > 1) next.delete(s); });
    } else {
      vendorSystems.forEach((s) => next.add(s));
    }
    onChange(next);
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {vendors.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">벤더:</span>
            {vendors.map((v) => (
              <button key={v} onClick={() => toggleVendor(v)} className={`badge cursor-pointer ${getVendorBadgeClass(v)}`}>
                {v}
              </button>
            ))}
          </div>
        )}

        <div className="h-4 w-px bg-surface-700" />

        {systems.map((sys) => {
          const vendor = specs[sys]?.Vendor ?? "";
          const active = activeSystems.has(sys);
          return (
            <button
              key={sys}
              onClick={() => {
                const next = new Set(activeSystems);
                if (active && next.size > 1) next.delete(sys);
                else next.add(sys);
                onChange(next);
              }}
              className={`badge cursor-pointer transition-all ${
                active ? getVendorBadgeClass(vendor) : "bg-surface-800 text-slate-500 border-surface-700"
              }`}
            >
              {shortSystemName(sys)}
            </button>
          );
        })}

        <button
          onClick={() => onChange(new Set(systems))}
          className="text-xs text-brand-400 hover:text-brand-300 transition-colors ml-auto"
        >
          전체 선택
        </button>
      </div>
    </div>
  );
}
