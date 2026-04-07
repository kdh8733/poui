import type { BenchmarkData, WorkloadGroup } from "../types/benchmark";

export function formatValue(value: number, unit: string): string {
  const u = unit?.toLowerCase() || "";
  if (u.includes("mib/s") || u.includes("mb/s")) {
    if (value >= 1024) return `${(value / 1024).toFixed(2)} GiB/s`;
    return `${value.toFixed(2)} MiB/s`;
  }
  if (u.includes("byte/s")) {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB/s`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB/s`;
    return `${value.toFixed(0)} B/s`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ${unit}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K ${unit}`;
  if (value < 0.01) return `${value.toExponential(2)} ${unit}`;
  return `${value.toFixed(3)} ${unit}`;
}

export function getNormalizedColor(score: number): string {
  if (score >= 2.0) return "#86efac"; // green
  if (score >= 1.5) return "#93c5fd"; // blue
  if (score >= 1.01) return "#fdba74"; // orange
  return "#fca5a5"; // red
}

export function getNormalizedBgClass(score: number): string {
  if (score >= 2.0) return "bg-green-500/20 text-green-300";
  if (score >= 1.5) return "bg-blue-500/20 text-blue-300";
  if (score >= 1.01) return "bg-orange-500/20 text-orange-300";
  return "bg-red-500/20 text-red-300";
}

export function getVendorColor(vendor: string): string {
  const colors: Record<string, string> = {
    DELL: "#0076CE",
    HP: "#0096D6",
    LENOVO: "#E2231A",
    SUPERMICRO: "#F37021",
  };
  return colors[vendor] || "#6366f1";
}

export function getVendorBadgeClass(vendor: string): string {
  const classes: Record<string, string> = {
    DELL: "bg-blue-600/20 text-blue-300 border-blue-600/30",
    HP: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30",
    LENOVO: "bg-red-600/20 text-red-300 border-red-600/30",
    SUPERMICRO: "bg-orange-600/20 text-orange-300 border-orange-600/30",
  };
  return classes[vendor] || "bg-purple-600/20 text-purple-300 border-purple-600/30";
}

export function buildWorkloadGroups(data: BenchmarkData): WorkloadGroup[] {
  const testNames = data.testList;
  const groups: WorkloadGroup[] = [
    {
      id: "webserver",
      label: "Web Server",
      icon: "🌐",
      color: "#06b6d4",
      tests: testNames.filter((t) => /nginx|apache http/i.test(t)),
    },
    {
      id: "memory",
      label: "Memory",
      icon: "🧠",
      color: "#8b5cf6",
      tests: testNames.filter((t) => /mbw|sysbench.*memory/i.test(t)),
    },
    {
      id: "cpu",
      label: "CPU",
      icon: "⚡",
      color: "#f59e0b",
      tests: testNames.filter((t) => /sysbench.*cpu/i.test(t)),
    },
    {
      id: "crypto",
      label: "Cryptography",
      icon: "🔐",
      color: "#10b981",
      tests: testNames.filter((t) => /openssl/i.test(t)),
    },
    {
      id: "distributed",
      label: "Distributed / DB",
      icon: "🗄️",
      color: "#f97316",
      tests: testNames.filter((t) => /etcd|hadoop|clickhouse|redis|postgres|mysql/i.test(t)),
    },
    {
      id: "storage",
      label: "Storage",
      icon: "💾",
      color: "#ec4899",
      tests: testNames.filter((t) => /ior|fio|disk/i.test(t)),
    },
    {
      id: "stress",
      label: "Stress-NG",
      icon: "🔥",
      color: "#ef4444",
      tests: testNames.filter((t) => /stress/i.test(t)),
    },
  ];

  // Collect remaining uncategorized
  const categorized = new Set(groups.flatMap((g) => g.tests));
  const others = testNames.filter((t) => !categorized.has(t) && !/stress/i.test(t));
  if (others.length > 0) {
    groups.push({ id: "other", label: "Other", icon: "📋", color: "#6b7280", tests: others });
  }

  return groups.filter((g) => g.tests.length > 0);
}

export function getSystemColors(systems: string[]): Record<string, string> {
  const palette = [
    "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa",
    "#38bdf8", "#4ade80", "#f87171", "#fbbf24", "#e879f9",
    "#2dd4bf", "#818cf8",
  ];
  return Object.fromEntries(systems.map((s, i) => [s, palette[i % palette.length]]));
}

export function shortSystemName(fullName: string): string {
  // "Intel Xeon 6740E / DELL" → "Xeon 6740E / DELL"
  return fullName.replace(/^Intel\s+/i, "").replace(/^AMD\s+/i, "");
}
