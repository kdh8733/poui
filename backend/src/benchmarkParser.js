"use strict";

const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  processEntities: false,
});

// ─── Vendor / Hardware Normalization ────────────────────────────────────────

function extractVendorInfo(logsDir) {
  try {
    if (!logsDir || !fs.existsSync(logsDir)) return "Unknown";
    const entries = fs.readdirSync(logsDir);
    for (const entry of entries) {
      const dmidecodePath = path.join(logsDir, entry, "dmidecode");
      if (fs.existsSync(dmidecodePath) && fs.statSync(dmidecodePath).isFile()) {
        const content = fs.readFileSync(dmidecodePath, "utf8");
        const match = content.match(/Manufacturer:\s*([^\n\r]+)/i);
        if (match) {
          const vendor = match[1].trim();
          if (vendor.includes("Dell")) return "DELL";
          if (vendor.includes("HP") || vendor.includes("Hewlett")) return "HP";
          if (vendor.includes("Lenovo")) return "LENOVO";
          if (vendor.includes("Supermicro")) return "SUPERMICRO";
          return vendor.toUpperCase();
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return "Unknown";
}

function truncateCpuName(fullName) {
  const intel = fullName.match(/Intel Xeon\s+([^@\s]+(?:\s+[^@\s]+)*)/i);
  if (intel) return `Intel Xeon ${intel[1]}`;
  const amd = fullName.match(/AMD\s+([^@\s]+(?:\s+[^@\s]+)*)/i);
  if (amd) return `AMD ${amd[1]}`;
  const other = fullName.match(/^([^@\s]+(?:\s+[^@\s]+)*)/);
  return other ? other[1] : fullName;
}

function normalizeMemoryString(memStr, logsDir) {
  try {
    if (!memStr) return memStr;
    const m = String(memStr).match(/^\s*(\d+)\s*x\s*(\d+)?\s*GB(.*)$/i);
    if (!m) return memStr;
    const count = parseInt(m[1], 10);
    if (m[2] || !count) return memStr;

    let memTotalKB = null;
    if (logsDir && fs.existsSync(logsDir)) {
      const entries = fs.readdirSync(logsDir);
      for (const e of entries) {
        const p = path.join(logsDir, e, "meminfo");
        try {
          if (fs.existsSync(p)) {
            const txt = fs.readFileSync(p, "utf8");
            const mt = txt.match(/MemTotal:\s*([0-9]+)\s*kB/i);
            if (mt) { memTotalKB = parseInt(mt[1], 10); break; }
          }
        } catch {}
      }
      if (memTotalKB == null) {
        try {
          const p2 = path.join(logsDir, "meminfo");
          if (fs.existsSync(p2)) {
            const txt2 = fs.readFileSync(p2, "utf8");
            const mt2 = txt2.match(/MemTotal:\s*([0-9]+)\s*kB/i);
            if (mt2) memTotalKB = parseInt(mt2[1], 10);
          }
        } catch {}
      }
    }

    let perSizeGB = null;
    if (memTotalKB != null) {
      const totalGB = memTotalKB / (1024 * 1024);
      const approx = totalGB / count;
      const candidates = [2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
      let best = candidates[0], bestDiff = Math.abs(best - approx);
      for (const c of candidates) {
        const d = Math.abs(c - approx);
        if (d < bestDiff) { best = c; bestDiff = d; }
      }
      perSizeGB = best;
    }
    if (perSizeGB != null) return `${count} x ${perSizeGB} GB${m[3] || ""}`;
    return memStr;
  } catch {
    return memStr;
  }
}

function normalizeDiskString(diskRaw) {
  if (!diskRaw || diskRaw === "N/A") return "N/A";
  return diskRaw.split(" + ").map((p) => p.trim()).sort().join(" + ");
}

// ─── Data Processing ─────────────────────────────────────────────────────────

function processDescriptions(descriptions, testName) {
  if (!descriptions || descriptions.length === 0) return "";
  if (testName === "Stress-NG") return `${descriptions[0]} (총 52개 테스트 수행)`;
  if (descriptions.length === 1) return descriptions[0];

  switch (testName) {
    case "etcd": {
      const puts = descriptions.filter((d) => d.includes("PUT")).length;
      const ranges = descriptions.filter((d) => d.includes("RANGE")).length;
      const parts = [];
      if (puts) parts.push(`PUT ${puts}개`);
      if (ranges) parts.push(`RANGE ${ranges}개`);
      return parts.join(" | ");
    }
    case "MBW": {
      const copies = descriptions.filter((d) => d.includes("Memory Copy") && !d.includes("Fixed Block")).length;
      const fixed = descriptions.filter((d) => d.includes("Fixed Block")).length;
      const parts = [];
      if (copies) parts.push(`Memory Copy ${copies}개`);
      if (fixed) parts.push(`Fixed Block ${fixed}개`);
      return parts.join(" | ");
    }
    case "OpenSSL": {
      const algs = [...new Set(descriptions.map((d) => {
        const m = d.match(/Algorithm:\s*(\w+)/);
        return m ? m[1] : d;
      }))];
      return algs.join(", ") + " 암호화";
    }
    case "Apache Hadoop": {
      const parts = [];
      if (descriptions.some((d) => d.includes("Open"))) parts.push("Open");
      if (descriptions.some((d) => d.includes("Create"))) parts.push("Create");
      if (descriptions.some((d) => d.includes("Delete"))) parts.push("Delete");
      return parts.join(" | ") + " 테스트";
    }
    default:
      return descriptions.slice(0, 3).join(" | ") + (descriptions.length > 3 ? ` 외 ${descriptions.length - 3}개` : "");
  }
}

function mergeIdenticalResults(rawData, sortedNames) {
  const merged = {};
  const systemOrder = Object.fromEntries(sortedNames.map((s, i) => [s, i]));

  Object.entries(rawData).forEach(([testName, data]) => {
    if (testName.startsWith("_")) { merged[testName] = data; return; }

    const grouped = {};
    (data.results || []).forEach((r) => {
      (grouped[r.system] || (grouped[r.system] = [])).push(r);
    });

    const mergedResults = [];
    Object.values(grouped).forEach((arr) => {
      if (arr.length === 1) { mergedResults.push(arr[0]); return; }
      const values = arr.map((r) => r.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
      mergedResults.push({
        system: arr[0].system,
        value: avg,
        unit: arr[0].unit,
        specs: arr[0].specs,
        statistics: { count: arr.length, min, max, avg, std, values },
      });
    });

    mergedResults.sort((a, b) => (systemOrder[a.system] ?? 999) - (systemOrder[b.system] ?? 999));

    merged[testName] = {
      results: mergedResults,
      descriptions: data.descriptions || [],
      description: processDescriptions(data.descriptions || [], testName),
      proportion: data.proportion || "HIB",
    };
  });
  return merged;
}

function buildStressSuites(stressRaw, sortedNames) {
  const suites = {};
  Object.entries(stressRaw).forEach(([suite, tests]) => {
    const entries = [];
    Object.entries(tests).forEach(([testLabel, perSystem]) => {
      const results = Object.entries(perSystem).map(([system, info]) => {
        const values = info.values;
        const unit = info.unit;
        const count = values.length;
        const avg = values.reduce((a, b) => a + b, 0) / count;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / count);
        const isLatency = /(latency|time|ms|us|sec)/i.test(unit);
        const score = isLatency && avg > 0 ? 1 / avg : avg;
        return { system, value: score, unit: isLatency ? "Score" : unit, statistics: { count, min, max, avg, std } };
      });
      results.sort((a, b) => sortedNames.indexOf(a.system) - sortedNames.indexOf(b.system));
      entries.push({ test: testLabel, unit: results[0]?.unit || "", results });
    });
    suites[suite] = entries;
  });
  return suites;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

function parseBenchmarks(resultsDir) {
  const testData = {};
  const specsMap = {};
  const stressRaw = {};

  let entries;
  try {
    entries = fs.readdirSync(resultsDir);
  } catch {
    throw new Error(`Cannot read results directory: ${resultsDir}`);
  }

  entries.forEach((entryDir) => {
    let compositePath = path.join(resultsDir, entryDir, "composite.xml");
    if (!fs.existsSync(compositePath)) {
      const dirPath = path.join(resultsDir, entryDir);
      try {
        const files = fs.readdirSync(dirPath);
        const found = files.find((f) => /composite\.xml$/i.test(f));
        if (found) compositePath = path.join(dirPath, found);
      } catch { return; }
    }
    if (!fs.existsSync(compositePath)) return;

    let xml;
    try { xml = fs.readFileSync(compositePath, "utf8"); } catch { return; }

    const json = xmlParser.parse(xml);
    const root = json?.PhoronixTestSuite;
    const system = root?.System;
    const hw = system?.Hardware || "";
    const sw = system?.Software || "";

    const cpuMatch = hw.match(/Processor: ([^,]+)/);
    if (!cpuMatch) return;
    const fullCpuName = cpuMatch[1].trim();

    const logsDir = path.join(resultsDir, entryDir, "system-logs");
    const vendor = extractVendorInfo(logsDir);

    const memRaw = hw.match(/Memory: ([^,]+)/)?.[1] || "N/A";
    const memFixed = normalizeMemoryString(memRaw, logsDir);
    const diskRaw = hw.match(/Disk: ([^,]+)/)?.[1] || "N/A";
    const networkRaw = hw.match(/Network: ([^,]+)/)?.[1] || "N/A";
    const motherboardRaw = hw.match(/Motherboard: ([^,]+)/)?.[1] || "N/A";

    const systemSpec = {
      CPU: fullCpuName,
      Vendor: vendor,
      Memory: memFixed,
      Disk: normalizeDiskString(diskRaw),
      Network: networkRaw,
      Motherboard: motherboardRaw,
      OS: sw.match(/OS: ([^,]+)/)?.[1] || "N/A",
      Kernel: sw.match(/Kernel: ([^,]+)/)?.[1] || "N/A",
      Compiler: sw.match(/Compiler: ([^,]+)/)?.[1] || "N/A",
      FileSystem: sw.match(/File-System: ([^,]+)/)?.[1] || "N/A",
    };

    const cpuName = truncateCpuName(fullCpuName);
    const baseName = `${cpuName} / ${vendor}`;
    const existing = Object.keys(specsMap).filter((n) => n.startsWith(baseName));
    let systemName = baseName;

    if (existing.length > 0) {
      let foundIdentical = false;
      for (const existingName of existing) {
        if (JSON.stringify(specsMap[existingName]) === JSON.stringify(systemSpec)) {
          systemName = existingName;
          foundIdentical = true;
          break;
        }
      }
      if (!foundIdentical) systemName = `${baseName} #${existing.length + 1}`;
    }

    if (!specsMap[systemName]) {
      specsMap[systemName] = systemSpec;
    } else {
      const cur = specsMap[systemName].Memory || "";
      if (/\b\d+\s*x\s*GB\b/i.test(cur) && /\b\d+\s*x\s*\d+\s*GB\b/i.test(memFixed)) {
        specsMap[systemName].Memory = memFixed;
      }
    }

    let results = root?.Result;
    if (!results) return;
    if (!Array.isArray(results)) results = [results];

    results.forEach((result) => {
      let testName = result?.Title || result?.Identifier || entryDir;
      const unit = result?.Scale || "Unknown";
      const testDescription = result?.Description || "";
      const proportion = result?.Proportion || "HIB";
      const entries2 = Array.isArray(result.Data?.Entry) ? result.Data.Entry : [result.Data?.Entry];
      if (!entries2) return;

      if (/sysbench/i.test(testName)) {
        if (/cpu/i.test(testDescription)) testName = "Sysbench - CPU";
        else if (/ram|memory/i.test(testDescription)) testName = "Sysbench - Memory";
      }

      if (!testData[testName]) testData[testName] = { results: [], descriptions: [], proportion };
      if (testDescription.trim() && !testData[testName].descriptions.includes(testDescription.trim())) {
        testData[testName].descriptions.push(testDescription.trim());
      }

      entries2.forEach((entry) => {
        const value = parseFloat(entry?.Value);
        if (isNaN(value)) return;
        testData[testName].results.push({ system: systemName, value, unit, specs: systemSpec });

        // stress-ng extraction
        if (/^stress[- ]?ng/i.test(entryDir) || /^stress[- ]?ng/i.test(testName) || /Test:\s*stress[- ]?ng/i.test(testDescription)) {
          const m = testDescription.match(/Test:\s*([^\n<]+)/i);
          const suiteName = m?.[1]?.trim() || result?.Title || "stress-ng";
          if (!stressRaw[suiteName]) stressRaw[suiteName] = {};
          if (!stressRaw[suiteName][testName]) stressRaw[suiteName][testName] = {};
          if (!stressRaw[suiteName][testName][systemName]) stressRaw[suiteName][testName][systemName] = { unit, values: [] };
          stressRaw[suiteName][testName][systemName].values.push(value);
        }
      });
    });
  });

  // Sort systems
  const sortedNames = Object.keys(specsMap).sort((a, b) => {
    const getNum = (s) => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : 0; };
    const diff = getNum(a) - getNum(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const merged = mergeIdenticalResults(testData, sortedNames);

  // Compute normalization
  const normalized = {};
  const testList = Object.keys(merged).filter((k) => !k.startsWith("_"));

  for (const testName of testList) {
    const data = merged[testName];
    const lowerIsBetter = data.proportion === "LIB" || /(hackbench|tensorflow|squeezenet)/i.test(testName);
    const values = data.results.map((r) => r.value).filter((v) => isFinite(v));
    const worst = values.length ? (lowerIsBetter ? Math.max(...values) : Math.min(...values)) : 0;

    data.results.forEach((r) => {
      if (!normalized[r.system]) normalized[r.system] = {};
      if (!worst || !isFinite(worst) || !isFinite(r.value) || r.value === 0) {
        normalized[r.system][testName] = 1.0;
      } else {
        normalized[r.system][testName] = lowerIsBetter ? worst / r.value : r.value / worst;
      }
    });
  }

  const summary = sortedNames.map((system) => {
    const scores = normalized[system] || {};
    const values = testList.map((t) => scores[t] ?? 0);
    const avg = values.reduce((a, b) => a + b, 0) / (testList.length || 1);
    return { system, scores, avg };
  });

  const stressSuites = buildStressSuites(stressRaw, sortedNames);

  return {
    systems: sortedNames,
    specs: Object.fromEntries(sortedNames.map((n) => [n, specsMap[n]])),
    tests: merged,
    testList,
    normalized,
    summary,
    stressSuites,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { parseBenchmarks };
