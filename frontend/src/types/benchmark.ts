export interface SystemSpec {
  CPU: string;
  Vendor: string;
  Memory: string;
  Disk: string;
  Network: string;
  Motherboard: string;
  OS: string;
  Kernel: string;
  Compiler: string;
  FileSystem: string;
}

export interface TestEntry {
  system: string;
  value: number;
  unit: string;
  specs: SystemSpec;
  statistics?: {
    count: number;
    min: number;
    max: number;
    avg: number;
    std: number;
    values?: number[];
  };
}

export interface TestData {
  results: TestEntry[];
  descriptions: string[];
  description: string;
  proportion: "HIB" | "LIB";
}

export interface StressEntry {
  test: string;
  unit: string;
  results: {
    system: string;
    value: number;
    unit: string;
    statistics: { count: number; min: number; max: number; avg: number; std: number };
  }[];
}

export interface NormalizedScore {
  [testName: string]: number;
}

export interface SummaryEntry {
  system: string;
  scores: NormalizedScore;
  avg: number;
}

export interface BenchmarkData {
  systems: string[];
  specs: Record<string, SystemSpec>;
  tests: Record<string, TestData>;
  testList: string[];
  normalized: Record<string, NormalizedScore>;
  summary: SummaryEntry[];
  stressSuites: Record<string, StressEntry[]>;
  generatedAt: string;
}

export type WorkloadGroup = {
  id: string;
  label: string;
  icon: string;
  tests: string[];
  color: string;
};
