"use strict";

const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// Paths
const resultsDir = "./results";
const templatePath = "./template.html";
const outputPath = "/var/www/index.html";

// Parser and data holders
const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, processEntities: false });
const testData = {};
const specsMap = {}; // system → spec
const stressRaw = {}; // suite → test → system → { unit, values: number[] }
const withLogs = process.argv.includes("--with-logs");

// Extract vendor information from system-logs
function extractVendorInfo(logsDir) {
  try {
    if (!logsDir || !fs.existsSync(logsDir)) return "Unknown";
    
    const entries = fs.readdirSync(logsDir);
    for (const entry of entries) {
      const dmidecodePath = path.join(logsDir, entry, 'dmidecode');
      if (fs.existsSync(dmidecodePath) && fs.statSync(dmidecodePath).isFile()) {
        const content = fs.readFileSync(dmidecodePath, 'utf8');
        const manufacturerMatch = content.match(/Manufacturer:\s*([^\n\r]+)/i);
        if (manufacturerMatch) {
          const vendor = manufacturerMatch[1].trim();
          // Normalize vendor names
          if (vendor.includes('Dell')) return 'DELL';
          if (vendor.includes('HP') || vendor.includes('Hewlett')) return 'HP';
          if (vendor.includes('Lenovo')) return 'LENOVO';
          if (vendor.includes('Supermicro')) return 'SUPERMICRO';
          return vendor.toUpperCase();
        }
      }
    }
  } catch (e) {
    console.warn(`Warning: Could not extract vendor info from ${logsDir}:`, e.message);
  }
  return "Unknown";
}

// Normalize CPU name into a concise label
function truncateCpuName(fullCpuName) {
  const intelXeonMatch = fullCpuName.match(/Intel Xeon\s+([^@\s]+(?:\s+[^@\s]+)*)/i);
  if (intelXeonMatch) return `Intel Xeon ${intelXeonMatch[1]}`;
  const amdMatch = fullCpuName.match(/AMD\s+([^@\s]+(?:\s+[^@\s]+)*)/i);
  if (amdMatch) return `AMD ${amdMatch[1]}`;
  const otherMatch = fullCpuName.match(/^([^@\s]+(?:\s+[^@\s]+)*)/);
  if (otherMatch) return otherMatch[1];
  return fullCpuName;
}

// Normalize/complete memory string like "16 x GB DDR4-..." → "16 x 16 GB DDR4-..."
function normalizeMemoryString(memoryStr, logsDir) {
  try {
    if (!memoryStr) return memoryStr;
    const m = String(memoryStr).match(/^\s*(\d+)\s*x\s*(\d+)?\s*GB(.*)$/i);
    if (!m) return memoryStr;
    const count = parseInt(m[1], 10);
    const hasPerSize = !!m[2];
    if (hasPerSize || !count || !isFinite(count) || count <= 0) return memoryStr;

    // Try to read MemTotal from meminfo under system-logs
    let memTotalKB = null;
    if (logsDir && fs.existsSync(logsDir)) {
      // common layout: system-logs/<memory-config>/meminfo
      const entries = fs.readdirSync(logsDir);
      for (const e of entries) {
        const p = path.join(logsDir, e, 'meminfo');
        try {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const txt = fs.readFileSync(p, 'utf8');
            const mt = txt.match(/MemTotal:\s*([0-9]+)\s*kB/i);
            if (mt) { memTotalKB = parseInt(mt[1], 10); break; }
          }
        } catch {}
      }
      // fallback: system-logs/meminfo
      if (memTotalKB == null) {
        const p2 = path.join(logsDir, 'meminfo');
        try {
          if (fs.existsSync(p2) && fs.statSync(p2).isFile()) {
            const txt2 = fs.readFileSync(p2, 'utf8');
            const mt2 = txt2.match(/MemTotal:\s*([0-9]+)\s*kB/i);
            if (mt2) memTotalKB = parseInt(mt2[1], 10);
          }
        } catch {}
      }
    }

    let perSizeGB = null;
    if (memTotalKB != null) {
      const totalGB = memTotalKB / (1024 * 1024); // kB → GB
      const approxPer = totalGB / count;
      // Snap to common server DIMM sizes
      const candidates = [2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
      let best = candidates[0];
      let bestDiff = Math.abs(best - approxPer);
      for (const c of candidates) {
        const d = Math.abs(c - approxPer);
        if (d < bestDiff) { best = c; bestDiff = d; }
      }
      perSizeGB = best;
  } else {
      // Heuristic by module part number tokens
      const s = String(memoryStr).toUpperCase();
      const pnRules = [
        { re: /HMA82GR7CJR8N/i, size: 16 },
        { re: /HMA84GR7/i, size: 32 },
        { re: /HMCG88AGBRA191N/i, size: 32 },
        { re: /M393A4G40/i, size: 32 },
        { re: /M393A2G40/i, size: 16 },
      ];
      for (const rule of pnRules) {
        if (rule.re.test(s)) { perSizeGB = rule.size; break; }
      }
    }
    if (perSizeGB != null) return `${count} x ${perSizeGB} GB${m[3] || ''}`;
    return memoryStr;
  } catch {
    return memoryStr;
  }
}

function normalizeDiskString(diskRaw) {
  if (!diskRaw || diskRaw === "N/A") return "N/A";
  
  // Split by " + " and sort each part
  const parts = diskRaw.split(' + ').map(part => part.trim()).sort();
  return parts.join(' + ');
}

// Optional: parse test-logs if enabled. Minimal resilient implementation.
 function parseTestLogs(logsPath, systemName) {
  try {
    if (!withLogs) return null;
    if (!fs.existsSync(logsPath)) return null;
    const stat = fs.statSync(logsPath);
    let logContent = "";
    if (stat.isDirectory()) {
      for (const file of fs.readdirSync(logsPath)) {
        const p = path.join(logsPath, file);
        const st = fs.statSync(p);
        if (st.isFile()) logContent += fs.readFileSync(p, "utf8") + "\n";
      }
    } else if (stat.isFile()) {
      logContent = fs.readFileSync(logsPath, "utf8");
    }
    if (!logContent.trim()) return null;
    return [{ run: 1, timestamp: "Unknown", data: [{ metric: "raw", value: logContent.length }] }];
  } catch {
    return null;
  }
}

function processDescriptions(descriptions, testName) {
  if (!descriptions || descriptions.length === 0) return "";
  
  if (testName === 'Stress-NG') {
    return `${descriptions[0]} (총 52개 테스트 수행)`;
  }
  
  if (descriptions.length === 1) {
    return descriptions[0];
  }
  
  const processed = processMultiDescriptions(descriptions, testName);
  return processed.join(' | ');
}

function processMultiDescriptions(descriptions, testName) {
  switch (testName) {
    case 'ClickHouse':
      const coldCache = descriptions.filter(d => d.includes('Cold Cache'));
      const secondRun = descriptions.filter(d => d.includes('Second Run'));
      const thirdRun = descriptions.filter(d => d.includes('Third Run'));
      const result = [];
      if (coldCache.length > 0) result.push('Cold Cache 테스트');
      if (secondRun.length > 0) result.push('Second Run 테스트');
      if (thirdRun.length > 0) result.push('Third Run 테스트');
      return result;
      
    case 'etcd':
      const putTests = descriptions.filter(d => d.includes('PUT'));
      const rangeTests = descriptions.filter(d => d.includes('RANGE'));
      const result2 = [];
      if (putTests.length > 0) result2.push(`PUT 테스트 (${putTests.length}개 변형)`);
      if (rangeTests.length > 0) result2.push(`RANGE 테스트 (${rangeTests.length}개 변형)`);
      return result2;
      
    case 'Apache Hadoop':
      const openTests = descriptions.filter(d => d.includes('Open'));
      const createTests = descriptions.filter(d => d.includes('Create'));
      const deleteTests = descriptions.filter(d => d.includes('Delete'));
      const result3 = [];
      if (openTests.length > 0) result3.push('Open 테스트');
      if (createTests.length > 0) result3.push('Create 테스트');
      if (deleteTests.length > 0) result3.push('Delete 테스트');
      return result3;
      
    case 'iPerf':
      // 중복 제거를 위해 unique descriptions만 추출
      const uniqueDescriptions = [...new Set(descriptions)];
      const tcpTests = uniqueDescriptions.filter(d => d.includes('TCP'));
      const udpTests = uniqueDescriptions.filter(d => d.includes('UDP'));
      const result4 = [];
      if (tcpTests.length > 0) result4.push(`TCP 테스트 (${tcpTests.length}개 변형)`);
      if (udpTests.length > 0) result4.push(`UDP 테스트 (${udpTests.length}개 변형)`);
      return result4;
      
    case 'MBW':
      const memCopyTests = descriptions.filter(d => d.includes('Memory Copy') && !d.includes('Fixed Block'));
      const fixedBlockTests = descriptions.filter(d => d.includes('Fixed Block'));
      const result5 = [];
      if (memCopyTests.length > 0) result5.push(`Memory Copy 테스트 (${memCopyTests.length}개 변형)`);
      if (fixedBlockTests.length > 0) result5.push(`Fixed Block 테스트 (${fixedBlockTests.length}개 변형)`);
      return result5;
      
    case 'OpenSSL':
      const uniqueAlgorithms = [...new Set(descriptions.map(d => {
        const match = d.match(/Algorithm: (\w+)/);
        return match ? match[1] : d;
      }))];
      return uniqueAlgorithms.map(alg => `${alg} 암호화`);
      
    case 'Sysbench':
      const cpuTests = descriptions.filter(d => d.includes('CPU'));
      const ramTests = descriptions.filter(d => d.includes('RAM') || d.includes('Memory'));
      const result7 = [];
      if (cpuTests.length > 0) result7.push('CPU 테스트');
      if (ramTests.length > 0) result7.push('Memory 테스트');
      return result7;
      
    case 'Sysbench - CPU':
      return descriptions.map((desc, idx) => `CPU 성능 테스트 ${idx + 1}`);
      
    case 'Sysbench - Memory':
      return descriptions.map((desc, idx) => `Memory 성능 테스트 ${idx + 1}`);
      
    default:
      return descriptions.map((desc, idx) => `${idx + 1}. ${desc}`);
  }
}

// Merge results by identical CPU spec to compute statistics
function mergeIdenticalResults(rawData) {
  const merged = {};
  Object.entries(rawData).forEach(([testName, data]) => {
    if (testName.startsWith("_")) { merged[testName] = data; return; }
    const grouped = {};
    (data.results || []).forEach((r) => {
      const key = r.system;
      (grouped[key] || (grouped[key] = [])).push(r);
    });
    const mergedResults = [];
    Object.values(grouped).forEach((arr) => {
      if (arr.length === 1) { mergedResults.push(arr[0]); return; }
      const values = arr.map((r) => r.value);
         const avg = values.reduce((a, b) => a + b, 0) / values.length;
         const min = Math.min(...values);
         const max = Math.max(...values);
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
      const allDetailedRuns = arr.filter((r) => r.detailedRuns).flatMap((r) => r.detailedRuns);
         mergedResults.push({
        system: arr[0].system,
           value: avg,
        unit: arr[0].unit,
        specs: arr[0].specs,
        detailedRuns: allDetailedRuns.length ? allDetailedRuns : null,
        statistics: { count: arr.length, min, max, avg, std, values }
      });
    });
    merged[testName] = {
      results: mergedResults,
      descriptions: data.descriptions || [], // Preserve the array of descriptions
      description: processDescriptions(data.descriptions || [], testName) // Generate a summary string
    };
  });
  return merged;
}

// Scan all composite.xml under results
fs.readdirSync(resultsDir).forEach((entryDir) => {
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

  const xml = fs.readFileSync(compositePath, "utf8");
  const json = parser.parse(xml);
  const root = json?.PhoronixTestSuite;
  const system = root?.System;
  const hw = system?.Hardware || "";
  const sw = system?.Software || "";
  const cpuMatch = hw.match(/Processor: ([^,]+)/);
  if (!cpuMatch) return;
  const fullCpuName = cpuMatch[1].trim();
  // Extract vendor information first
  const logsDir = path.join(resultsDir, entryDir, 'system-logs');
  const vendor = extractVendorInfo(logsDir);
  
  // Always compute memory; update if we can improve missing per-DIMM size
  const memRaw = hw.match(/Memory: ([^,]+)/)?.[1] || "N/A";
  const memFixed = normalizeMemoryString(memRaw, logsDir);
  
  // Create full system spec for comparison
  const diskRaw = hw.match(/Disk: ([^,]+)/)?.[1] || "N/A";
  const systemSpec = {
    CPU: fullCpuName,
    Vendor: vendor,
    Memory: memFixed,
    Disk: normalizeDiskString(diskRaw),
    OS: sw.match(/OS: ([^,]+)/)?.[1] || "N/A",
    Kernel: sw.match(/Kernel: ([^,]+)/)?.[1] || "N/A",
    Compiler: sw.match(/Compiler: ([^,]+)/)?.[1] || "N/A",
  };
  
  // Create system name with CPU + Vendor format
  const cpuName = truncateCpuName(fullCpuName);
  const baseSystemName = `${cpuName} / ${vendor}`;
  
  // Check for existing systems with same base name but different specs
  const existingSystems = Object.keys(specsMap).filter(name => name.startsWith(baseSystemName));
  let systemName = baseSystemName;
  
  if (existingSystems.length > 0) {
    // Check if any existing system has identical specs
    let foundIdentical = false;
    for (const existingName of existingSystems) {
      const existingSpec = specsMap[existingName];
      const currentSpecStr = JSON.stringify(systemSpec);
      const existingSpecStr = JSON.stringify(existingSpec);
      
      if (currentSpecStr === existingSpecStr) {
        systemName = existingName; // Use existing identical system
        foundIdentical = true;
        break;
      }
    }
    
    // If no identical system found, create new numbered system
    if (!foundIdentical) {
      const nextNumber = existingSystems.length + 1;
      systemName = `${baseSystemName} #${nextNumber}`;
    }
  }
  
  if (!specsMap[systemName]) {
    specsMap[systemName] = systemSpec;
  } else {
    const cur = specsMap[systemName].Memory || '';
    const missingPerSize = /\b\d+\s*x\s*GB\b/i.test(cur);
    const hasPerSize = /\b\d+\s*x\s*\d+\s*GB\b/i.test(memFixed);
    if (missingPerSize && hasPerSize) {
      specsMap[systemName].Memory = memFixed;
    }
  }

  let results = root?.Result;
  if (!results) return;
  if (!Array.isArray(results)) results = [results];

  results.forEach((result) => {
    let testName = result?.Title || result?.Identifier || entryDir;
    const unit = result?.Scale || "Unknown Unit";
    const testDescription = result?.Description || ""; // 테스트 설명 추출
    const entries = Array.isArray(result.Data?.Entry) ? result.Data.Entry : [result.Data?.Entry];
    if (!entries) return;
    
    // Sysbench 테스트의 경우 CPU와 Memory로 분리
    if (testName === 'Sysbench' || testName.toLowerCase().includes('sysbench')) {
      if (testDescription.includes('CPU') || testDescription.toLowerCase().includes('cpu')) {
        testName = 'Sysbench - CPU';
      } else if (testDescription.includes('RAM') || testDescription.includes('Memory') || 
                 testDescription.toLowerCase().includes('memory') || testDescription.toLowerCase().includes('ram')) {
        testName = 'Sysbench - Memory';
      }
    }
    
    if (!testData[testName]) {
      testData[testName] = { results: [], descriptions: [] }; // Changed to store an array
    }
    if (testDescription && testDescription.trim()) {
      const trimmedDesc = testDescription.trim();
      if (!testData[testName].descriptions.includes(trimmedDesc)) {
        testData[testName].descriptions.push(trimmedDesc);
      }
    }

    entries.forEach((entry) => {
      const value = parseFloat(entry?.Value);
      if (isNaN(value)) return;
      const logsPath = path.join(resultsDir, entryDir, "test-logs");
      const detailedRuns = withLogs ? parseTestLogs(logsPath, systemName) : null;
      testData[testName].results.push({ system: systemName, value, unit, specs: specsMap[systemName], detailedRuns: detailedRuns || null });

      // stress-ng suite extraction
      const description = result?.Description || "";
      if (/^stress[- ]?ng/i.test(entryDir) || /^stress[- ]?ng/i.test(testName) || /Test:\s*stress[- ]?ng/i.test(String(description))) {
        const m = String(description).match(/Test:\s*([^\n<]+)/i);
        const suiteName = (m && m[1]) ? m[1].trim() : (result?.Title || "stress-ng");
        if (!stressRaw[suiteName]) stressRaw[suiteName] = {};
        const testLabel = testName;
        if (!stressRaw[suiteName][testLabel]) stressRaw[suiteName][testLabel] = {};
        if (!stressRaw[suiteName][testLabel][systemName]) stressRaw[suiteName][testLabel][systemName] = { unit, values: [] };
        stressRaw[suiteName][testLabel][systemName].values.push(value);
      }
    });
  });
});

// Sort systems by number in CPU name, then lexicographically
const sortedSystemNames = Object.keys(specsMap).sort((a, b) => {
  const getCpuNumber = (cpuName) => {
    const m = cpuName.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const aNum = getCpuNumber(a);
  const bNum = getCpuNumber(b);
  if (aNum !== bNum) return aNum - bNum;
  return a.localeCompare(b);
});
const sortedSpecsMap = {}; sortedSystemNames.forEach((n) => { sortedSpecsMap[n] = specsMap[n]; });

testData._specs = sortedSpecsMap;

// Merge identical systems and order results according to sorted systems
const mergedTestData = mergeIdenticalResults(testData);
const systemOrder = Object.fromEntries(sortedSystemNames.map((s, i) => [s, i]));
Object.keys(mergedTestData).forEach((name) => {
  if (name.startsWith("_")) return;
  mergedTestData[name].results.sort((a, b) => systemOrder[a.system] - systemOrder[b.system]);
});

// Normalization summary (kept for index.html consumers)
const normalized = {};
const testWorstValues = {};
const testIsLowerBetter = {};
for (const [testName, data] of Object.entries(mergedTestData)) {
  if (testName.startsWith("_")) continue;
  const values = data.results.map((r) => r.value).filter((v) => typeof v === "number" && isFinite(v));
  const lowerIsBetter = /(hackbench|tensorflow|squeezenet)/i.test(testName);
  testIsLowerBetter[testName] = lowerIsBetter;
  testWorstValues[testName] = values.length ? (lowerIsBetter ? Math.max(...values) : Math.min(...values)) : 0;
}
for (const [testName, data] of Object.entries(mergedTestData)) {
  if (testName.startsWith("_")) continue;
  const worst = testWorstValues[testName];
  const lowerIsBetter = !!testIsLowerBetter[testName];
  data.results.forEach((r) => {
    if (!normalized[r.system]) normalized[r.system] = {};
    if (!worst || !isFinite(worst) || !isFinite(r.value) || r.value === 0) normalized[r.system][testName] = 1.0;
    else normalized[r.system][testName] = lowerIsBetter ? (worst / r.value) : (r.value / worst);
  });
}
const testList = Object.keys(mergedTestData).filter((k) => !k.startsWith("_"));
const summary = Object.entries(normalized).map(([system, scores]) => {
  const values = testList.map((t) => (scores[t] ?? 0));
  const avg = values.reduce((a, b) => a + b, 0) / (testList.length || 1);
  return { system, scores, avg };
});
mergedTestData._normalized = { tests: testList, summary };

// Externalize data for index.html
const dataJs = "window.testData = " + JSON.stringify(mergedTestData) + ";\n";
fs.writeFileSync(path.join("/var/www", "data.js"), dataJs);
const templateRaw = fs.readFileSync(templatePath, "utf8");
const cacheBust = Date.now().toString();
const template = templateRaw.replace(/<script\s+src=["']\.\/data\.js["']><\/script>/, `<script src="./data.js?v=${cacheBust}"></script>`);
fs.writeFileSync(outputPath, template);
console.log("Generated systems:", Object.keys(specsMap));
console.log("✅ index.html 생성 완료");

// Build stress-ng suites and html
function buildStressSuites(raw) {
  const suites = {};
  Object.entries(raw).forEach(([suite, tests]) => {
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
        const labelLc = String(testLabel || "").toLowerCase();
        const unitLc = String(unit || "").toLowerCase();
        const isLatency = /(response|responsetime|latency|time|ms|us|µs|sec|seconds)/.test(labelLc) || /(ms|us|µs|sec|seconds)/.test(unitLc);
        let score = avg; let scoreUnit = unit;
        if (isLatency) { score = avg > 0 ? (1 / avg) : 0; scoreUnit = "Score"; }
        return { system, value: score, unit: scoreUnit, statistics: { count, min, max, avg, std } };
      });
      results.sort((a, b) => sortedSystemNames.indexOf(a.system) - sortedSystemNames.indexOf(b.system));
      entries.push({ test: testLabel, unit: results[0]?.unit || "", results });
    });
    suites[suite] = entries;
  });
  return suites;
}

function buildStressHtml(suites, allSystems, specs) {
  const suitesB64 = Buffer.from(JSON.stringify(suites)).toString("base64");
  const specsB64 = Buffer.from(JSON.stringify(specs)).toString("base64");
  const systemsB64 = Buffer.from(JSON.stringify(allSystems)).toString("base64");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>stress-ng Results</title>
  <link rel="stylesheet" href="./styles.css" />
  <script src="./chart.js"></script>
</head>
<body>
  <h1>stress-ng Results</h1>
  <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:6px 0 10px 0;">
    <a href="./stress-ng-guide.html" target="_blank" style="text-decoration:none;"><button>ℹ️ Stress‑NG Guide</button></a>
  </div>
  <details id="active-systems-wrap" open>
    <summary>🖥 Active Systems</summary>
    <div id="active-systems" class="small"></div>
    <div id="system-filters"></div>
  </details>
  <details open>
    <summary>📋 System Specs Table</summary>
    <div id="system-specs"></div>
  </details>
  <details id="charts-wrap">
    <summary>📈 Charts</summary>
    <div id="charts-grid"></div>
  </details>
  <h2>Tables</h2>
  <div id="tables"></div>
  <details id="matrix-wrap">
    <summary>📊 Normalized Comparison Matrix</summary>
    <div id="matrix-controls" style="margin:8px 0 8px 0;"></div>
    <div id="matrix"></div>
  </details>
  <div class="footer">© dh.kim / kimseongmin</div>
  <script>
    const suites = JSON.parse(atob('${suitesB64}'));
    const specs = JSON.parse(atob('${specsB64}'));
    const allSystems = JSON.parse(atob('${systemsB64}'));
    const activeSystems = new Set(allSystems);
    
    // 벤더 필터 전역 변수 초기화
    window.stressVendors = new Set();
    window.stressActiveVendors = new Set(['DELL', 'HP']);
    window.stressVendorCheckboxes = {};
    function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }
    function sanitizeTitle(raw){
      var s = String(raw||'');
      s = s.replace(/\\s*[-–—]?\\s*stress\\s*-?\\s*ng\\s*[-–—]?\\s*/ig,' ');
      s = s.replace(/POSIX Regular Expre\\s*ion/ig,'POSIX Regular Expressions');
      s = s.replace(/System V Me\\s*age Pa\\s*ing/ig,'System V Message Passing');
      s = s.replace(/Be\\s*el\\s+Math\\s+Operations/ig,'Bessel Math Operations');
      s = s.replace(/Me\\s*age/ig,'Message');
      s = s.replace(/Pa\\s*ing/ig,'Passing');
      s = s.replace(/Expre\\s*ion/ig,'Expression');
      s = s.replace(/\\s{2,}/g,' ').replace(/\\s*-\\s*$/,'').replace(/^[-–—\\s]+|[-–—\\s]+$/g,'');
      return s.trim();
    }
    function cleanLabel(name){
      if(!name) return '';
      let n = String(name);
      n = n.replace(/\\s*[-–—]?\\s*stress\\s*-?\\s*ng\\s*[-–—]?\\s*/ig, ' ');
      n = n.replace(/\\s{2,}/g, ' ').replace(/\\s*[-–—]\\s*/g, ' - ').replace(/( - )+/g, ' - ');
      n = n.replace(/^[-–—\\s]+|[-–—\\s]+$/g, '');
      return n;
    }
    function buildTitle(suite, test){
      var sRaw = String(suite || '');
      var tClean = cleanLabel(String(test || ''));
      var sClean = cleanLabel(sRaw);
      if(/^stress[- ]?ng/i.test(sRaw)) { return tClean || sClean || 'Test'; }
      if(!sClean) return tClean || 'Test';
      return sClean + (tClean ? (' - ' + tClean) : '');
    }
    function buildMatrixLabel(suite, test){
      var raw = buildTitle(suite, test);
      var label = sanitizeTitle(raw);
      if(!label) label = (raw || String(test||''));
      label = String(label).replace(/\\s*-\\s*$/,'').trim();
      return label;
    }
    function renderFilters(){
      const box = document.getElementById('system-filters');
      box.innerHTML = '';
      
      // 벤더사 추출 (한 번만 실행)
      if (window.stressVendors.size === 0) {
        allSystems.forEach(sys => {
          const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
          if (vendorMatch) {
            window.stressVendors.add(vendorMatch[1]);
          }
        });
      }
      
      // 벤더 필터 섹션 추가
      if (window.stressVendors.size > 1) {
        const vendorSection = document.createElement('div');
        vendorSection.style.cssText = 'margin-bottom: 20px; padding: 8px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e5e7eb; clear: both; width: 100%; display: block;';
        
        const vendorTitle = document.createElement('div');
        vendorTitle.textContent = '🏢 벤더사 필터';
        vendorTitle.style.cssText = 'font-weight: bold; color: #374151; margin-bottom: 6px; font-size: 11px;';
        vendorSection.appendChild(vendorTitle);
        
        const vendorContainer = document.createElement('div');
        vendorContainer.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
        
        [...window.stressVendors].sort().forEach(vendor => {
          const vendorLabel = document.createElement('label');
          vendorLabel.style.cssText = 'display: inline-flex; align-items: center; padding: 3px 8px; background-color: #e0f2fe; border: 1px solid #0891b2; border-radius: 16px; font-size: 10px; font-weight: 500; cursor: pointer; color: #0c4a6e;';
          
          const vendorCheckbox = document.createElement('input');
          vendorCheckbox.type = 'checkbox';
          
          // 현재 activeSystems 상태에 따라 초기 체크 상태 결정
          const vendorSystems = allSystems.filter(sys => {
            const sysVendorMatch = sys.match(/\\/ ([A-Z]+)/);
            return sysVendorMatch && sysVendorMatch[1] === vendor;
          });
          const checkedVendorSystems = vendorSystems.filter(sys => activeSystems.has(sys));
          vendorCheckbox.checked = checkedVendorSystems.length > 0;
          
          vendorCheckbox.style.cssText = 'margin-right: 4px; transform: scale(0.8);';
          
          // 벤더 체크박스 참조 저장
          window.stressVendorCheckboxes[vendor] = { checkbox: vendorCheckbox, label: vendorLabel };
          
          // 초기 스타일 설정
          if (checkedVendorSystems.length === 0) {
            vendorLabel.style.backgroundColor = '#f3f4f6';
            vendorLabel.style.borderColor = '#d1d5db';
            vendorLabel.style.color = '#6b7280';
            window.stressActiveVendors.delete(vendor);
          } else if (checkedVendorSystems.length === vendorSystems.length) {
            vendorLabel.style.backgroundColor = '#e0f2fe';
            vendorLabel.style.borderColor = '#0891b2';
            vendorLabel.style.color = '#0c4a6e';
            window.stressActiveVendors.add(vendor);
          } else {
            vendorLabel.style.backgroundColor = '#fef3c7';
            vendorLabel.style.borderColor = '#f59e0b';
            vendorLabel.style.color = '#92400e';
            window.stressActiveVendors.add(vendor);
          }
          
          vendorCheckbox.onchange = () => {
            if (vendorCheckbox.checked) {
              window.stressActiveVendors.add(vendor);
              vendorLabel.style.backgroundColor = '#e0f2fe';
              vendorLabel.style.borderColor = '#0891b2';
              vendorLabel.style.color = '#0c4a6e';
              
              // 해당 벤더의 모든 시스템을 활성화
              allSystems.forEach(sys => {
                const sysVendorMatch = sys.match(/\\/ ([A-Z]+)/);
                if (sysVendorMatch && sysVendorMatch[1] === vendor) {
                  activeSystems.add(sys);
                }
              });
            } else {
              window.stressActiveVendors.delete(vendor);
              vendorLabel.style.backgroundColor = '#f3f4f6';
              vendorLabel.style.borderColor = '#d1d5db';
              vendorLabel.style.color = '#6b7280';
              
              // 해당 벤더의 모든 시스템을 비활성화
              allSystems.forEach(sys => {
                const sysVendorMatch = sys.match(/\\/ ([A-Z]+)/);
                if (sysVendorMatch && sysVendorMatch[1] === vendor) {
                  activeSystems.delete(sys);
                }
              });
            }
            
            renderFilters();
            renderSpecs();
            render();
          };
          
          vendorLabel.appendChild(vendorCheckbox);
          vendorLabel.append(vendor);
          vendorContainer.appendChild(vendorLabel);
        });
        
        vendorSection.appendChild(vendorContainer);
        box.appendChild(vendorSection);
      }
      
      // CPU 모델별로 시스템 그룹화 (template.html과 동일한 로직)
      const modelGroups = {};
      
      function getCpuModelGroup(cpuModel) {
        const modelMatch = cpuModel.match(/(\\d{4})/);
        if (!modelMatch) {
          return { model: 'Other', order: 9999, fullName: '기타 CPU' };
        }
        
        const modelNum = parseInt(modelMatch[1]);
        
        if (modelNum === 4216) {
          return { model: '4216', order: 4216, fullName: 'Intel Xeon Silver 4216' };
        } else if (modelNum === 4416) {
          return { model: '4416', order: 4416, fullName: 'Intel Xeon Silver 4416+' };
        } else if (modelNum === 6737) {
          return { model: '6737P', order: 6737, fullName: 'Intel Xeon 6737P' };
        } else if (modelNum === 6740) {
          return { model: '6740E', order: 6740, fullName: 'Intel Xeon 6740E' };
        } else {
          return { model: String(modelNum), order: modelNum, fullName: 'Intel Xeon ' + modelNum };
        }
      }
      
      allSystems.forEach(sys => {
        const cpuMatch = sys.match(/Intel Xeon (.+?) \\//);
        const cpuModel = cpuMatch ? cpuMatch[1] : 'Other';
        const modelInfo = getCpuModelGroup(cpuModel);
        
        if (!modelGroups[modelInfo.model]) {
          modelGroups[modelInfo.model] = {
            systems: [],
            order: modelInfo.order,
            fullName: modelInfo.fullName
          };
        }
        
        modelGroups[modelInfo.model].systems.push(sys);
      });
      
      const sortedModels = Object.keys(modelGroups).sort((a, b) => {
        return modelGroups[a].order - modelGroups[b].order;
      });
      
      // 각 모델별로 시스템 표시
      let visibleGroupIndex = 0;
      sortedModels.forEach((modelKey, modelIndex) => {
        const modelData = modelGroups[modelKey];
        
        // 현재 벤더 필터에 해당하는 시스템이 있는지 확인
        const hasVisibleSystems = modelData.systems.some(sys => {
          const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
          const systemVendor = vendorMatch ? vendorMatch[1] : 'Unknown';
          return window.stressActiveVendors.has(systemVendor);
        });
        
        if (!hasVisibleSystems) {
          return;
        }
        
        // 모델별 구분선
        if (visibleGroupIndex > 0) {
          const separator = document.createElement('hr');
          separator.style.cssText = 'margin: 20px 0; border: none; border-top: 3px solid #3b82f6; clear: both; width: 100%;';
          box.appendChild(separator);
        }
        
        // 모델 제목과 체크박스 추가
        const modelHeader = document.createElement('div');
        modelHeader.style.cssText = 'display: flex; align-items: center; margin: 8px 0 6px 0; clear: both;';
        
        const modelCheckbox = document.createElement('input');
        modelCheckbox.type = 'checkbox';
        modelCheckbox.style.cssText = 'margin-right: 6px; transform: scale(1.1);';
        
        // 현재 모델의 모든 시스템이 체크되어 있는지 확인
        const modelSystems = modelData.systems.filter(sys => {
          const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
          const systemVendor = vendorMatch ? vendorMatch[1] : 'Unknown';
          return window.stressActiveVendors.has(systemVendor);
        });
        const checkedModelSystems = modelSystems.filter(sys => activeSystems.has(sys));
        modelCheckbox.checked = checkedModelSystems.length === modelSystems.length && modelSystems.length > 0;
        
        // 모델 체크박스 참조 저장 (전역 변수가 없으면 생성)
        if (!window.stressModelCheckboxes) {
          window.stressModelCheckboxes = {};
        }
        window.stressModelCheckboxes[modelKey] = modelCheckbox;
        
        modelCheckbox.onchange = () => {
          if (modelCheckbox.checked) {
            // 해당 모델의 모든 시스템 체크
            modelSystems.forEach(sys => {
              activeSystems.add(sys);
            });
          } else {
            // 해당 모델의 모든 시스템 해제
            modelSystems.forEach(sys => {
              activeSystems.delete(sys);
            });
          }
          
          // 벤더 체크박스 상태 업데이트
          updateStressVendorCheckboxes();
          
          renderFilters();
          renderSpecs();
          render();
        };
        
        const modelTitle = document.createElement('span');
        modelTitle.textContent = modelData.fullName;
        modelTitle.style.cssText = 'font-weight: bold; color: #1f2937; font-size: 12px; cursor: pointer;';
        modelTitle.onclick = () => {
          modelCheckbox.checked = !modelCheckbox.checked;
          modelCheckbox.onchange();
        };
        
        modelHeader.appendChild(modelCheckbox);
        modelHeader.appendChild(modelTitle);
        box.appendChild(modelHeader);
        
        // 각 그룹을 담을 컨테이너 생성
        const groupContainer = document.createElement('div');
        groupContainer.style.cssText = 'margin-bottom: 12px; line-height: 1.8; clear: both; width: 100%; display: block;';
        
        visibleGroupIndex++;
        
        const sortedSystems = modelData.systems.sort((a, b) => {
          const getNumbers = (str) => {
            const matches = str.match(/\\d+/g);
            return matches ? matches.map(n => parseInt(n)) : [0];
          };
          
          const numsA = getNumbers(a);
          const numsB = getNumbers(b);
          
          for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
            const numA = numsA[i] || 0;
            const numB = numsB[i] || 0;
            if (numA !== numB) return numA - numB;
          }
          return a.localeCompare(b);
        });
        
        sortedSystems.forEach(sys => {
          const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
          const systemVendor = vendorMatch ? vendorMatch[1] : 'Unknown';
          
          if (!window.stressActiveVendors.has(systemVendor)) {
            return;
          }
          
        const label = document.createElement('label');
          label.style.cssText = 'display: inline-block; margin: 2px 8px 2px 0; white-space: nowrap; font-size: 11px; vertical-align: middle; cursor: pointer; padding: 2px 6px; background-color: #f3f4f6; border-radius: 12px; border: 1px solid #e5e7eb;';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = sys;
          checkbox.checked = activeSystems.has(sys);
          checkbox.style.cssText = 'margin-right: 4px; transform: scale(0.9); vertical-align: middle;';
          checkbox.onchange = () => {
            if (checkbox.checked) {
              activeSystems.add(sys);
              label.style.backgroundColor = '#dbeafe';
              label.style.borderColor = '#3b82f6';
            } else {
              activeSystems.delete(sys);
              label.style.backgroundColor = '#f9fafb';
              label.style.borderColor = '#d1d5db';
            }
            
            // 벤더 및 모델 체크박스 상태 업데이트
            updateStressVendorCheckboxes();
            updateStressModelCheckboxes();
            renderSpecs();
            render();
          };
          
          if (checkbox.checked) {
            label.style.backgroundColor = '#dbeafe';
            label.style.borderColor = '#3b82f6';
          } else {
            label.style.backgroundColor = '#f9fafb';
            label.style.borderColor = '#d1d5db';
          }
          
          label.appendChild(checkbox);
          label.append(sys);
          groupContainer.appendChild(label);
        });
        
        box.appendChild(groupContainer);
      });
    }
    
    function updateStressVendorCheckboxes() {
      Object.keys(window.stressVendorCheckboxes).forEach(vendor => {
        const vendorSystems = allSystems.filter(sys => {
          const sysVendorMatch = sys.match(/\\/ ([A-Z]+)/);
          return sysVendorMatch && sysVendorMatch[1] === vendor;
        });
        
        const checkedSystems = vendorSystems.filter(sys => activeSystems.has(sys));
        const { checkbox, label } = window.stressVendorCheckboxes[vendor];
        
        if (checkedSystems.length === 0) {
          checkbox.checked = false;
          window.stressActiveVendors.delete(vendor);
          label.style.backgroundColor = '#f3f4f6';
          label.style.borderColor = '#d1d5db';
          label.style.color = '#6b7280';
        } else if (checkedSystems.length === vendorSystems.length) {
          checkbox.checked = true;
          window.stressActiveVendors.add(vendor);
          label.style.backgroundColor = '#e0f2fe';
          label.style.borderColor = '#0891b2';
          label.style.color = '#0c4a6e';
        } else {
          checkbox.checked = true;
          window.stressActiveVendors.add(vendor);
          label.style.backgroundColor = '#fef3c7';
          label.style.borderColor = '#f59e0b';
          label.style.color = '#92400e';
        }
      });
    }
    
    function updateStressModelCheckboxes() {
      if (!window.stressModelCheckboxes) return;
      
      Object.keys(window.stressModelCheckboxes).forEach(modelKey => {
        const modelCheckbox = window.stressModelCheckboxes[modelKey];
        
        // 해당 모델의 시스템들 찾기
        const modelSystems = allSystems.filter(sys => {
          const cpuMatch = sys.match(/Intel Xeon (.+?) \\//);
          const cpuModel = cpuMatch ? cpuMatch[1] : 'Other';
          const modelInfo = getCpuModelGroup(cpuModel);
          
          if (modelInfo.model !== modelKey) return false;
          
          const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
          const systemVendor = vendorMatch ? vendorMatch[1] : 'Unknown';
          return window.stressActiveVendors.has(systemVendor);
        });
        
        const checkedModelSystems = modelSystems.filter(sys => activeSystems.has(sys));
        modelCheckbox.checked = checkedModelSystems.length === modelSystems.length && modelSystems.length > 0;
      });
    }
    
    // 벤더 필터를 고려한 시스템 필터링 함수
    function getVisibleSystems() {
      console.log('getVisibleSystems 호출됨');
      console.log('window.stressActiveVendors:', window.stressActiveVendors ? [...window.stressActiveVendors] : 'undefined');
      
      // 벤더 필터가 초기화되지 않았으면 모든 시스템 표시
      if (!window.stressActiveVendors || window.stressActiveVendors.size === 0) {
        console.log('벤더 필터 없음 - 모든 activeSystems 반환');
        return allSystems.filter(function(sys) {
          return activeSystems.has(sys);
        });
      }
      
      const result = allSystems.filter(function(sys) {
        // activeSystems에 포함되어야 하고
        if (!activeSystems.has(sys)) return false;
        
        // 벤더 필터도 통과해야 함
        const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
        const systemVendor = vendorMatch ? vendorMatch[1] : 'Unknown';
        const passes = window.stressActiveVendors.has(systemVendor);
        console.log('시스템 ' + sys + ' → 벤더: ' + systemVendor + ', 통과: ' + passes);
        return passes;
      });
      
      console.log('최종 필터링 결과:', result);
      return result;
    }
    
    function renderSpecs(){
      const specBox = document.getElementById('system-specs');
      
      // 디버깅 로그 추가
      console.log('renderSpecs 호출됨');
      console.log('activeSystems:', [...activeSystems]);
      console.log('window.stressActiveVendors:', window.stressActiveVendors ? [...window.stressActiveVendors] : 'undefined');
      
      const shown = getVisibleSystems();
      console.log('getVisibleSystems 결과:', shown);
      
      if(shown.length===0){ specBox.innerHTML=''; return; }
      var fields = ['CPU','Memory','Disk','OS','Kernel','Compiler'];
      var html = '<table style="table-layout:fixed;font-size:10px;font-weight:bold">';
      html += '<colgroup><col style="width:18%">';
      var rest = shown.length>0 ? Math.floor(82/shown.length) : 82;
      shown.forEach(function(){ html += '<col style="width:'+rest+'%">'; });
      html += '</colgroup>';
      html += '<thead><tr><th>항목</th>' + shown.map(function(s){ return '<th>' + escapeHtml(s) + '</th>'; }).join('') + '</tr></thead>';
      html += '<tbody>';
      fields.forEach(function(field){
        html += '<tr><td>' + field + '</td>' + shown.map(function(s){ var val = (specs[s] && specs[s][field]) ? specs[s][field] : '-'; return '<td>' + escapeHtml(String(val)) + '</td>'; }).join('') + '</tr>';
      });
      html += '</tbody></table>';
      specBox.innerHTML = html;
    }
    var selectedTests = null;
    function unique(arr){ var s = new Set(); return arr.filter(function(x){ if(s.has(x)) return false; s.add(x); return true; }); }
    function byAlpha(a,b){ return String(a).localeCompare(String(b)); }
    function chunk(arr, size){ var out=[]; for(var i=0;i<arr.length;i+=size){ out.push(arr.slice(i, i+size)); } return out; }
    function getCategoryByGuide(suiteName, testName){
      function key(x){ return sanitizeTitle(String(x||'')).toLowerCase().replace(/\\\\s+/g,' ').trim(); }
      var k = key(testName);
      // 사용자 제공 매핑
      var groups = {
        '수치 연산·SIMD (벡터/행렬/특수함수)': [
          'vector math','matrix math','floating point','fused multiply-add','matrix 3d math','vector floating point','vector shuffle','wide vector math','avx-512 vnni','exponential math','fractal generator','logarithmic math','power math','trigonometric math','integer math','integer bit operations','bessel math operations','hyperbolic trigonometric math'
        ],
        '메모리 계층/할당/가상메모리 (NUMA 포함)': [
          'memory copying','cpu cache','malloc','memfd','mmap','numa','avl tree'
        ],
        '커널·IPC·스케줄링/동기화': [
          'forking','system v message passing','semaphores','socket activity','context switching','atomic','sendfile','io_uring','futex','mutex','poll','pthread','pipe','cloning','mixed scheduler'
        ],
        '데이터 처리 라이브러리/알고리즘 (문자열·정렬·해시·압축·암호)': [
          'crypto','glibc qsort data sorting','glibc c string functions','hash','zlib','jpeg compression','bitonic integer sort','radix string sort','posix regular expressions'
        ],
        '코어 마이크로아키텍처/제어흐름·특수명령': [
          'cpu stress','x86_64 rdrand','function call'
        ]
      };
      // 약어/동의어 보정
      var syn = {
        'vector fp':'vector floating point',
        'posix regex':'posix regular expressions',
        'posix regular expression':'posix regular expressions',
        'jpeg':'jpeg compression',
        'bitonic sort':'bitonic integer sort',
        'radix sort':'radix string sort',
        'qsort':'glibc qsort data sorting',
        'c string funcs':'glibc c string functions'
      };
      if (syn[k]) k = syn[k];
      for (var cat in groups){
        if (groups[cat].includes(k)) return cat;
      }
      // fallback: 간단 휴리스틱
      var s = (key(suiteName)+' '+k);
      if(/avx|vector|matrix|floating|fma|vnni|bessel|hyperbolic|trigonometric|logarithmic|power|exponential|shuffle|integer/.test(s))
        return '수치 연산·SIMD (벡터/행렬/특수함수)';
      if(/memory|cache|malloc|memfd|mmap|numa|avl/.test(s))
        return '메모리 계층/할당/가상메모리 (NUMA 포함)';
      if(/fork|clone|pthread|mutex|futex|semaphore|poll|pipe|socket|sendfile|io_uring|context|sysv|scheduler|atomic/.test(s))
        return '커널·IPC·스케줄링/동기화';
      if(/crypto|qsort|string|hash|zlib|jpeg|bitonic|radix|regex/.test(s))
        return '데이터 처리 라이브러리/알고리즘 (문자열·정렬·해시·압축·암호)';
      return '코어 마이크로아키텍처/제어흐름·특수명령';
    }
    function render(){
      const charts = document.getElementById('charts-grid');
      const tables = document.getElementById('tables');
      const matrix = document.getElementById('matrix');
      charts.innerHTML=''; tables.innerHTML=''; matrix.innerHTML='';
      // Make chart groups span full width like System Specs Table
      charts.style.display = 'block';
      charts.style.gridTemplateColumns = 'none';
      charts.style.gap = '0';
      const allEntries = [];
      Object.keys(suites).forEach(function(suite){ (suites[suite]||[]).forEach(function(e){ allEntries.push({ suite: suite, test: e.test, unit: e.unit, results: e.results }); }); });
      let allTests = unique(allEntries.map(function(e){ return buildMatrixLabel(e.suite, e.test); })).filter(Boolean).sort(byAlpha);
      let labelToEntry = {}; allEntries.forEach(function(e){ var label = buildMatrixLabel(e.suite, e.test); if(label){ labelToEntry[label] = e; } });
      if(allTests.length === 0){ allTests = unique(allEntries.map(function(e){ return String(e.test||''); })).filter(Boolean).sort(byAlpha); labelToEntry = {}; allEntries.forEach(function(e){ var label = String(e.test||''); labelToEntry[label] = e; }); }
      if(!selectedTests){ selectedTests = new Set(allTests); }
      // Charts grouped by guide categories
      const CATS = ['수치 연산·SIMD (벡터/행렬/특수함수)','메모리 계층/할당/가상메모리 (NUMA 포함)','커널·IPC·스케줄링/동기화','데이터 처리 라이브러리/알고리즘 (문자열·정렬·해시·압축·암호)','코어 마이크로아키텍처/제어흐름·특수명령'];
      function displayCat(cat){ return cat; }
      const byCatCharts = {};
      allEntries.forEach(function(e){ var cat = getCategoryByGuide(e.suite, e.test); (byCatCharts[cat]||(byCatCharts[cat]=[])).push(e); });
      // Categories stacked vertically; each category has its own inner grid for charts
      CATS.forEach(function(cat){
        if(!byCatCharts[cat] || byCatCharts[cat].length===0) return;
        var catDetails = document.createElement('details'); catDetails.open = true; catDetails.style.padding='6px 8px';
        var sum = document.createElement('summary'); sum.textContent = displayCat(cat); sum.style.fontSize='13px'; catDetails.appendChild(sum);
        charts.appendChild(catDetails);
        var catGrid = document.createElement('div');
        catGrid.style.display = 'block'; // 그리드 대신 블록으로 변경하여 전체 너비 사용
        catGrid.style.marginTop = '6px';
        catDetails.appendChild(catGrid);
        // 그룹별로 차트를 1개로 통합
        const allLabels = [];
        const allData = [];
        const originalData = []; // 원본 값과 단위 저장
        const testLabels = []; // 테스트명 저장
        const backgroundColors = [];
        const borderColors = [];
        
        // 색상 팔레트
        const colors = [
          'rgba(59, 130, 246, 0.6)',   // blue
          'rgba(34, 197, 94, 0.6)',    // green
          'rgba(234, 179, 8, 0.6)',    // yellow
          'rgba(239, 68, 68, 0.6)',    // red
          'rgba(168, 85, 247, 0.6)',   // purple
          'rgba(249, 115, 22, 0.6)',   // orange
          'rgba(20, 184, 166, 0.6)',   // teal
          'rgba(244, 63, 94, 0.6)',    // pink
        ];

        let colorIndex = 0;
        byCatCharts[cat].forEach(function(entry){
          const fullName = buildMatrixLabel(entry.suite, entry.test);
          const filtered = entry.results.filter(function(r){ return getVisibleSystems().includes(r.system); });
          if(filtered.length===0) return;

          // 각 테스트 내에서 최대값 계산
          const testValues = filtered.map(function(r){ return r.value; });
          const maxValue = Math.max(...testValues);

          filtered.forEach(function(result) {
            // 각 테스트 내에서 상대적 비율로 정규화 (최대값을 100으로)
            const normalizedValue = maxValue > 0 ? (result.value / maxValue) * 100 : 0;
            
            allLabels.push(result.system);
            allData.push(normalizedValue);
            originalData.push({ value: result.value, unit: entry.unit || '', rawValue: result.value });
            testLabels.push(fullName);
            
            const color = colors[colorIndex % colors.length];
            backgroundColors.push(color);
            borderColors.push(color.replace('0.6', '1'));
          });
          colorIndex++;
        });

        if (allLabels.length === 0) return;

        // 그룹 통합 차트 생성
        const card = document.createElement('div');
        card.className = 'chart-card';
        card.style.position = 'relative';
        const safeId = 'unified-chart-' + btoa(unescape(encodeURIComponent(cat))).replace(/=/g,'');
        card.innerHTML = '<h3>' + escapeHtml(displayCat(cat)) + '</h3><canvas id="' + safeId + '"></canvas>';
        
        // 단위 정보 박스 제거됨 (통합 차트에서 불필요)
        catGrid.appendChild(card);

        setTimeout(function(){
          // 가로형 차트: 항목 수에 따른 동적 차트 높이 계산
          const itemCount = allLabels.length;
          const heightPerItem = 35; // 각 항목당 고정 높이 증가 (여백 포함)
          const basePadding = 200; // 상하 여백 더 증가
          const dynamicHeight = Math.max(300, itemCount * heightPerItem + basePadding);
          
          const ctx = document.getElementById(safeId);
          const container = ctx.parentElement;
          container.style.height = dynamicHeight + 'px';
          container.style.position = 'relative';
          container.style.overflow = 'hidden'; // visible → hidden으로 변경
          container.style.marginBottom = '30px'; // 그룹 간 여백 증가
          container.style.border = 'none'; // 테두리 제거
          container.style.background = 'transparent'; // 배경 투명
          ctx.style.height = '100%';
          ctx.style.width = '100%';

          // 하이라이트 관련 변수들
          var highlightedIndex = -1;
          var highlightedSystem = null;
          var highlightedTest = null;
          var originalBackgroundColors = [...backgroundColors];
          var originalBorderColors = [...borderColors];
          var systemIndexMap = {};
          allLabels.forEach(function(system, index) {
            if (!systemIndexMap[system]) systemIndexMap[system] = [];
            systemIndexMap[system].push(index);
          });

          var chart = new Chart(ctx,{ 
            type:'bar', 
            data:{ 
              labels: allLabels, 
              datasets:[{ 
                label:'Performance', 
                data: allData, 
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth:1, 
                barPercentage:0.6, 
                categoryPercentage:0.7 
              }] 
            }, 
            plugins:[{
              id:'testLabels',
              afterRender:function(chart){
                // 기존 라벨들 제거
                var existingLabels = container.querySelectorAll('.test-label-overlay');
                existingLabels.forEach(function(label) { label.remove(); });

                // 테스트별 그룹 위치 계산 (더 안정적인 방법)
                var testGroups = {};
                var currentTestName = '';
                var groupStartIndex = 0;
                
                testLabels.forEach(function(testName, index) {
                  if (testName !== currentTestName) {
                    if (currentTestName && !testGroups[currentTestName]) {
                      testGroups[currentTestName] = {
                        startIndex: groupStartIndex,
                        endIndex: index - 1,
                        name: currentTestName
                      };
                    }
                    currentTestName = testName;
                    groupStartIndex = index;
                  }
                });
                
                // 마지막 그룹 처리
                if (currentTestName && !testGroups[currentTestName]) {
                  testGroups[currentTestName] = {
                    startIndex: groupStartIndex,
                    endIndex: testLabels.length - 1,
                    name: currentTestName
                  };
                }

                // 각 테스트 그룹의 중앙 위치에 라벨 생성
                Object.keys(testGroups).forEach(function(testName) {
                  var group = testGroups[testName];
                  var meta = chart.getDatasetMeta(0);
                  var startBar = meta.data[group.startIndex];
                  var endBar = meta.data[group.endIndex];
                  
                  if (startBar && endBar) {
                    // 그룹의 중앙 Y 위치 계산 (경계선보다 아래쪽에 위치)
                    var centerY = (startBar.y + endBar.y) / 2;
                    
                    var labelDiv = document.createElement('div');
                    labelDiv.className = 'test-label-overlay';
                    labelDiv.textContent = testName;
                    labelDiv.style.position = 'absolute';
                    labelDiv.style.left = '15px';
                    labelDiv.style.top = (centerY + 5) + 'px';
                    labelDiv.style.fontSize = '11px';
                    labelDiv.style.fontWeight = 'bold';
                    labelDiv.style.color = '#1f2937';
                    labelDiv.style.cursor = 'pointer';
                    labelDiv.style.zIndex = '10';
                    labelDiv.style.whiteSpace = 'nowrap';
                    labelDiv.style.pointerEvents = 'auto';
                    labelDiv.style.userSelect = 'none';
                    labelDiv.style.backgroundColor = 'rgba(255,255,255,0.9)';
                    labelDiv.style.padding = '3px 6px';
                    labelDiv.style.borderRadius = '4px';
                    labelDiv.style.border = '1px solid rgba(0,0,0,0.1)';
                    labelDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

                    // 클릭 이벤트 추가 (토글 기능 포함)
                    labelDiv.addEventListener('click', function() {
                      // 현재 하이라이트된 테스트가 클릭된 테스트와 같으면 해제
                      if (highlightedTest === testName) {
                        resetHighlight(chart);
                        highlightedTest = null;
                        this.style.backgroundColor = 'rgba(255,255,255,0.9)';
                        this.style.color = '#1f2937';
                      } else {
                        highlightTestSystems(testName, chart);
                        highlightedTest = testName;
                        // 모든 라벨 스타일 리셋
                        container.querySelectorAll('.test-label-overlay').forEach(function(label) {
                          label.style.backgroundColor = 'rgba(255,255,255,0.9)';
                          label.style.color = '#1f2937';
                        });
                        // 클릭된 라벨만 하이라이트
                        this.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
                        this.style.color = 'white';
                      }
                    });

                    // 호버 효과
                    labelDiv.addEventListener('mouseenter', function() {
                      if (highlightedTest !== testName) {
                        this.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                        this.style.transform = 'scale(1.05)';
                      }
                    });
                    labelDiv.addEventListener('mouseleave', function() {
                      if (highlightedTest !== testName) {
                        this.style.backgroundColor = 'rgba(255,255,255,0.9)';
                        this.style.transform = 'scale(1)';
                      }
                    });

                    container.appendChild(labelDiv);
                  }
                });
              }
            }, {
              id:'testSeparators',
              beforeDraw:function(chart){
                var ctx = chart.ctx;
                var chartArea = chart.chartArea;
                ctx.save();
                ctx.strokeStyle = 'rgba(200,200,200,0.5)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3,3]);
                var currentTest = '';
                chart.data.labels.forEach(function(label, index){
                  var testName = testLabels[index];
                  if(testName !== currentTest && index > 0){
                    var meta = chart.getDatasetMeta(0);
                    var bar = meta.data[index];
                    var prevBar = meta.data[index - 1];
                    if(bar && prevBar){
                      var y = (bar.y + prevBar.y) / 2;
                      ctx.beginPath();
                      ctx.moveTo(0, y);
                      ctx.lineTo(chartArea.right, y);
                      ctx.stroke();
                    }
                  }
                  currentTest = testName;
                });
                ctx.restore();
              }
            }],
            options:{ 
              indexAxis:'y', 
              responsive:true, 
              maintainAspectRatio:false, 
              animation:false, 
              interaction:{ intersect:true, mode:'point' },
              onClick: function(event, elements) {
                if (elements.length > 0) {
                  var clickedIndex = elements[0].index;
                  var clickedSystem = allLabels[clickedIndex];
                  highlightSystemBars(clickedSystem, chart);
                }
              }, 
              plugins:{ 
                legend:{ display:false }, 
                tooltip:{ 
                  enabled:true, 
                  intersect:true, 
                  mode:'point', 
                  position:'nearest',
                  backgroundColor:'rgba(0,0,0,0.8)',
                  titleColor:'white',
                  bodyColor:'white',
                  borderColor:'rgba(255,255,255,0.3)',
                  borderWidth:1,
                  cornerRadius:6,
                  displayColors:false,
                  callbacks:{ 
                    title:function(context){ return context[0].label; }, 
                    label:function(context){ 
                      var dataIndex = context.dataIndex;
                      var original = originalData[dataIndex];
                      var percentage = context.parsed.x.toFixed(1);
                      return original.value.toLocaleString() + ' ' + original.unit + ' (' + percentage + '%)';
                    } 
                  } 
                }
              }, 
              scales:{ 
                x:{ beginAtZero:true, display:false, grid:{ display:false }, border:{ display:false } }, 
                y:{ ticks:{ font:{ size:9 }, maxTicksLimit: itemCount }, grid:{ display:true, drawBorder:false }, border:{ display:false } } 
              }, 
              layout:{ padding:{ top:25, bottom:50, left:210, right:50 } } 
            } 
          });

          // 하이라이트 함수들
          function highlightSystemBars(systemName, chart) {
            if (highlightedSystem === systemName) {
              resetHighlight(chart);
              return;
            }

            highlightedSystem = systemName;
            var indices = systemIndexMap[systemName] || [];
            
            // 모든 막대를 흐리게
            var newBackgroundColors = originalBackgroundColors.map(function(color) {
              return color.replace(/0\\.6\\)$/, '0.2)');
            });
            var newBorderColors = originalBorderColors.map(function(color) {
              return color.replace(/1\\)$/, '0.2)');
            });

            // 선택된 시스템의 막대만 밝게
            indices.forEach(function(idx) {
              newBackgroundColors[idx] = originalBackgroundColors[idx];
              newBorderColors[idx] = originalBorderColors[idx];
            });

            chart.data.datasets[0].backgroundColor = newBackgroundColors;
            chart.data.datasets[0].borderColor = newBorderColors;
            chart.update('none');
          }

          function highlightTestSystems(testName, chart) {
            var indices = [];
            testLabels.forEach(function(label, idx) {
              if (label === testName) indices.push(idx);
            });

            if (indices.length === 0) return;

            // 모든 막대를 흐리게
            var newBackgroundColors = originalBackgroundColors.map(function(color) {
              return color.replace(/0\\.6\\)$/, '0.2)');
            });
            var newBorderColors = originalBorderColors.map(function(color) {
              return color.replace(/1\\)$/, '0.2)');
            });

            // 선택된 테스트의 막대만 밝게
            indices.forEach(function(idx) {
              newBackgroundColors[idx] = originalBackgroundColors[idx];
              newBorderColors[idx] = originalBorderColors[idx];
            });

            chart.data.datasets[0].backgroundColor = newBackgroundColors;
            chart.data.datasets[0].borderColor = newBorderColors;
            chart.update('none');
          }

          function resetHighlight(chart) {
            highlightedSystem = null;
            highlightedTest = null;
            chart.data.datasets[0].backgroundColor = [...originalBackgroundColors];
            chart.data.datasets[0].borderColor = [...originalBorderColors];
            chart.update('none');
          }

          // 캔버스에 커서 포인터 설정
          ctx.style.cursor = 'pointer';

        },0);
      });
      // Tables grouped by guide categories
      var topDetails = document.createElement('details');
      var topSummary = document.createElement('summary'); topSummary.textContent = 'All Tables (by Guide Category)';
      topDetails.appendChild(topSummary); tables.appendChild(topDetails);
      const byCatTables = {};
      allEntries.forEach(function(e){ var cat = getCategoryByGuide(e.suite, e.test); (byCatTables[cat]||(byCatTables[cat]=[])).push(e); });
      CATS.forEach(function(cat){
        if(!byCatTables[cat] || byCatTables[cat].length===0) return;
        var catDetails = document.createElement('details'); catDetails.open = true; catDetails.style.padding='6px 8px';
        var catSummary = document.createElement('summary'); catSummary.textContent = displayCat(cat); catSummary.style.fontSize='13px'; catDetails.appendChild(catSummary);
        topDetails.appendChild(catDetails);
        var container = document.createElement('div'); container.style.marginTop = '2px'; catDetails.appendChild(container);
        byCatTables[cat].forEach(function(entry){
          var safeTitle = buildMatrixLabel(entry.suite, entry.test);
          if(safeTitle){ var title = document.createElement('h3'); title.textContent = safeTitle; title.style.margin = '4px 0 2px 0'; title.style.fontSize = '12px'; container.appendChild(title); }
          const filtered = entry.results.filter(function(r){ return getVisibleSystems().includes(r.system); });
          var table = document.createElement('table'); table.style.margin = '2px 0 6px 0'; table.style.fontSize = '12px'; table.style.tableLayout = 'fixed';
          var colgroup = document.createElement('colgroup'); var c1 = document.createElement('col'); c1.style.width = '40%'; var c2 = document.createElement('col'); c2.style.width = '20%'; var c3 = document.createElement('col'); c3.style.width = '20%'; var c4 = document.createElement('col'); c4.style.width = '20%';
          colgroup.appendChild(c1); colgroup.appendChild(c2); colgroup.appendChild(c3); colgroup.appendChild(c4); table.appendChild(colgroup);
          var thead = document.createElement('thead'); var trh = document.createElement('tr'); ['System','Score','Unit','Statistics'].forEach(function(col){ var th = document.createElement('th'); th.textContent = col; trh.appendChild(th); }); thead.appendChild(trh); table.appendChild(thead);
          var tbody = document.createElement('tbody');
          const bestValue = filtered.length ? Math.max.apply(null, filtered.map(function(r){ return r.value; })) : 0;
          filtered.forEach(function(r){
            var tr = document.createElement('tr'); if(r.value===bestValue && filtered.length>0){ tr.style.fontWeight = '600'; tr.style.background = '#dbeafe'; }
            var statsInfo='-'; if(r.statistics && r.statistics.count>1){ var baseAvg = (typeof r.statistics.avg === 'number') ? r.statistics.avg : null; statsInfo = baseAvg != null ? (String(r.statistics.count) + ' runs · base avg: ' + baseAvg.toFixed(4)) : (String(r.statistics.count) + ' runs'); }
            var tdSys = document.createElement('td'); tdSys.textContent = r.system; tr.appendChild(tdSys);
            var tdVal = document.createElement('td'); tdVal.textContent = r.value.toFixed(2); tr.appendChild(tdVal);
            var tdUnit = document.createElement('td'); tdUnit.textContent = (entry.unit||r.unit||''); tr.appendChild(tdUnit);
            var tdStat = document.createElement('td'); tdStat.textContent = statsInfo; tr.appendChild(tdStat);
            tbody.appendChild(tr);
          });
          table.appendChild(tbody); container.appendChild(table);
        });
      });
      // Matrix controls
      var controls = document.getElementById('matrix-controls'); controls.innerHTML = '';
      var searchWrap = document.createElement('div'); var search = document.createElement('input'); search.type = 'search'; search.placeholder = '테스트 검색...'; search.style.padding = '6px 10px'; search.style.border = '1px solid var(--muted)'; search.style.borderRadius = '8px'; searchWrap.appendChild(search); controls.appendChild(searchWrap);
      var btnRow = document.createElement('div'); btnRow.style.margin = '8px 0'; btnRow.style.display = 'flex'; btnRow.style.gap = '8px'; var btnAll = document.createElement('button'); btnAll.textContent = '전체 선택'; var btnNone = document.createElement('button'); btnNone.textContent = '전체 선택 해제'; btnRow.appendChild(btnAll); btnRow.appendChild(btnNone); controls.appendChild(btnRow);
      var list = document.createElement('div'); list.style.display='grid'; list.style.gap='8px'; list.style.marginTop = '8px'; controls.appendChild(list);
      function renderControlsList(){
        list.innerHTML = '';
        var q = (search.value || '').toLowerCase();
        const testsByCat = {};
        allTests.forEach(function(t){ if(q && t.toLowerCase().indexOf(q)===-1) return; var e = labelToEntry[t]; if(!e) return; var cat = getCategoryByGuide(e.suite, e.test); (testsByCat[cat]||(testsByCat[cat]=[])).push(t); });
        CATS.forEach(function(cat){
          var arr = (testsByCat[cat]||[]).sort(byAlpha); if(arr.length===0) return;
          var box = document.createElement('div'); box.style.border='1px solid var(--muted)'; box.style.borderRadius='8px'; box.style.padding='6px';
          var title = document.createElement('div'); title.textContent = displayCat(cat); title.style.fontSize='12px'; title.style.fontWeight='700'; title.style.margin='0 0 4px 0'; box.appendChild(title);
          var grid = document.createElement('div'); grid.className='checklist'; box.appendChild(grid);
          arr.forEach(function(t){ var label = document.createElement('label'); label.className='check-item'; label.title=t; var cb = document.createElement('input'); cb.type='checkbox'; cb.checked = selectedTests.has(t); cb.onchange=function(){ if(cb.checked) selectedTests.add(t); else selectedTests.delete(t); renderMatrix(); }; var text = document.createElement('span'); text.textContent=t; label.appendChild(cb); label.appendChild(text); grid.appendChild(label); });
          list.appendChild(box);
        });
      }
      search.oninput = renderControlsList; btnAll.onclick = function(){ selectedTests = new Set(allTests); renderControlsList(); renderMatrix(); }; btnNone.onclick = function(){ selectedTests = new Set(); renderControlsList(); renderMatrix(); }; renderControlsList();
      function isLowerBetter(label){ var e = labelToEntry[label]; var t = (e && e.test) ? e.test.toLowerCase() : ''; var u = (e && e.unit) ? String(e.unit).toLowerCase() : ''; if(/(latency|time|ms|sec|seconds)/.test(t) || /(ms|sec|seconds)/.test(u)) return true; return false; }
      function getTierClass(v){ if(!v || v <= 1.0) return 'tier-base'; if(v >= 2.0) return 'tier-best'; if(v >= 1.5) return 'tier-good'; if(v > 1.0) return 'tier-warn'; return ''; }
      function renderMatrix(){
        const container = document.getElementById('matrix'); container.innerHTML = '';
        const systems = getVisibleSystems();
        const testsAll = allTests.filter(function(t){ return selectedTests.has(t); });
        // 그룹별 테스트 묶기
        const testsByCat = {};
        testsAll.forEach(function(label){ var e = labelToEntry[label]; if(!e) return; var cat = getCategoryByGuide(e.suite, e.test); (testsByCat[cat]||(testsByCat[cat]=[])).push(label); });
        var widthBase = container.clientWidth || window.innerWidth || 1200; var systemCol = 160, col = 140; var maxColsBase = Math.max(1, Math.floor((widthBase - systemCol) / col)); if(!isFinite(maxColsBase) || maxColsBase < 1) maxColsBase = 6;
        // Compute single global summary across all selected tests (regardless of groups)
        var combinedGlobal = {};
        systems.forEach(function(system){
          var sum = 0, cnt = 0;
          testsAll.forEach(function(t){
            var e = labelToEntry[t]; if(!e) return;
            var filtered = e.results.filter(function(r){ return getVisibleSystems().includes(r.system); });
            if(filtered.length===0) return;
            var values = filtered.map(function(x){ return x.value; });
            var worst = isLowerBetter(t) ? Math.max.apply(null, values) : Math.min.apply(null, values);
            var r = e.results.find(function(rr){ return rr.system===system; });
            if(r){ var v = isLowerBetter(t) ? (worst / (r.value || 1)) : ((r.value || 0) / (worst || 1)); sum += v; cnt++; }
          });
          combinedGlobal[system] = cnt ? (sum / cnt) : 0;
        });
        CATS.forEach(function(cat){
          var tests = testsByCat[cat] || []; if(tests.length===0) return;
          var catDetails = document.createElement('details'); catDetails.open = true;
          var sum = document.createElement('summary'); sum.textContent = displayCat(cat); sum.style.fontSize='13px'; sum.style.whiteSpace='normal'; catDetails.appendChild(sum);
          container.appendChild(catDetails);
          var rowsAll = systems.map(function(system){ var row = { system: system, scores: {} }; tests.forEach(function(t){ var e = labelToEntry[t]; if(!e) return; var filtered = e.results.filter(function(r){ return systems.includes(r.system); }); if(filtered.length===0) return; var values = filtered.map(function(x){ return x.value; }); var worst = isLowerBetter(t) ? Math.max.apply(null, values) : Math.min.apply(null, values); var r = e.results.find(function(rr){ return rr.system===system; }); if(r){ row.scores[t] = isLowerBetter(t) ? (worst / (r.value || 1)) : ((r.value || 0) / (worst || 1)); } }); return row; });
          var globalAvg = {}; rowsAll.forEach(function(row){ var sum = tests.reduce(function(s,t){ return row.scores[t] ? s + row.scores[t] : s; }, 0); globalAvg[row.system] = tests.length ? (sum / tests.length) : 0; });
          var chunks = chunk(tests, maxColsBase);
          chunks.forEach(function(testChunk){ var html = '<table style="font-size:12px"><tr><th>System</th>' + testChunk.map(function(t){ return '<th>' + escapeHtml(t) + '</th>'; }).join('') + '</tr>'; rowsAll.forEach(function(row){ html += '<tr><td>' + escapeHtml(row.system) + '</td>'; testChunk.forEach(function(t){ var v = row.scores[t]; var cls = getTierClass(v); html += '<td class="' + cls + '">' + (v ? v.toFixed(2) : '-') + '</td>'; }); html += '</tr>'; }); html += '</table>'; catDetails.insertAdjacentHTML('beforeend', html); });
        });
        // Single summary at the very bottom using combinedGlobal across all tests
        var finalSummary = '<h3>Summary</h3><table style="font-size:12px; margin:6px 0 10px 0"><tr><th>System</th><th>Summary</th></tr>';
        systems.forEach(function(system){ var v = combinedGlobal[system]; finalSummary += '<tr><td>' + escapeHtml(system) + '</td><td><strong>' + (isFinite(v) ? v.toFixed(2) : '-') + '</strong></td></tr>'; });
        finalSummary += '</table>';
        container.insertAdjacentHTML('beforeend', finalSummary);
      }
      renderMatrix();
      var matrixWrap = document.getElementById('matrix-wrap'); if(matrixWrap){ matrixWrap.addEventListener('toggle', function(){ renderMatrix(); }); }
    }
    // 벤더 필터 먼저 초기화
    allSystems.forEach(sys => {
      const vendorMatch = sys.match(/\\/ ([A-Z]+)/);
      if (vendorMatch) {
        window.stressVendors.add(vendorMatch[1]);
      }
    });
    
    // no plain text summary to avoid duplication; chips reflect state
    renderFilters(); 
    setTimeout(() => {
      renderSpecs(); 
      render();
    }, 100);
  </script>
</body>
</html>`;
}

const stressSuites = buildStressSuites(stressRaw);
const stressHtml = buildStressHtml(stressSuites, sortedSystemNames, sortedSpecsMap);
fs.writeFileSync(path.join("/var/www", "stress-ng.html"), stressHtml);
console.log("✅ stress-ng.html 생성 완료");

