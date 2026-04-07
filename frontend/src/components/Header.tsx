import type { SystemSpec } from "../types/benchmark";

interface Props {
  systems: string[];
  specs: Record<string, SystemSpec>;
  activeSystems: Set<string>;
  onSystemsChange: (s: Set<string>) => void;
}

export default function Header({ systems, activeSystems }: Props) {
  return (
    <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-surface-900 border-b border-surface-700/50">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-200">
          Phoronix Benchmark Analyzer
        </h1>
        <span className="text-xs text-slate-500">
          {activeSystems.size} / {systems.length} 시스템 활성
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>{systems.length}개 서버</span>
        <span className="w-px h-3 bg-surface-700" />
        <span>Rocky Linux 9.4</span>
        <span className="w-px h-3 bg-surface-700" />
        <span>Phoronix Test Suite</span>
      </div>
    </header>
  );
}
