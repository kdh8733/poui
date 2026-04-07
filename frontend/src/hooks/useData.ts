import useSWR from "swr";
import type { BenchmarkData } from "../types/benchmark";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function useBenchmarkData() {
  const { data, error, isLoading, mutate } = useSWR<BenchmarkData>("/api/data", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60_000,
  });

  const refresh = async () => {
    await fetch("/api/refresh", { method: "POST" });
    await mutate();
  };

  return { data, error, isLoading, refresh };
}
