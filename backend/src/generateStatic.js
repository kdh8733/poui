"use strict";
/**
 * generateStatic.js
 * Parses benchmark results and generates a self-contained index.html
 * with all data embedded — no server needed after generation.
 *
 * Usage:
 *   RESULTS_DIR=./results node src/generateStatic.js [output.html]
 */
const fs   = require("fs");
const path = require("path");
const { parseBenchmarks } = require("./benchmarkParser");

const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, "../../results");
const OUT_FILE    = process.argv[2] || path.join(__dirname, "../../index.html");

function shortName(n) {
  return n.replace(/^Intel\s+/i, "").replace(/^AMD\s+/i, "");
}
function fmtVal(v, unit) {
  const u = (unit||"").toLowerCase();
  if (u.includes("mib/s") || u.includes("mb/s")) {
    return v >= 1024 ? `${(v/1024).toFixed(2)} GiB/s` : `${v.toFixed(2)} MiB/s`;
  }
  if (u.includes("byte/s")) {
    if (v >= 1e9)  return `${(v/1e9).toFixed(2)} GB/s`;
    if (v >= 1e6)  return `${(v/1e6).toFixed(2)} MB/s`;
    return `${v.toFixed(0)} B/s`;
  }
  if (v >= 1e6) return `${(v/1e6).toFixed(2)}M ${unit}`;
  if (v >= 1e3) return `${(v/1e3).toFixed(2)}K ${unit}`;
  return `${v.toFixed(2)} ${unit}`;
}

const PALETTE = ["#60a5fa","#34d399","#f472b6","#fb923c","#a78bfa",
                 "#38bdf8","#4ade80","#f87171","#fbbf24","#e879f9","#2dd4bf","#818cf8"];
const HEAT = (s) => s >= 2.0 ? "#86efac" : s >= 1.5 ? "#93c5fd" : s >= 1.01 ? "#fdba74" : "#fca5a5";
const HEAT_BG = (s) => s >= 2.0 ? "#14532d33" : s >= 1.5 ? "#1e3a8a33" : s >= 1.01 ? "#7c2d1233" : "#7f1d1d33";

async function main() {
  console.log("Parsing benchmarks from:", RESULTS_DIR);
  const d = parseBenchmarks(RESULTS_DIR);
  const sys = d.systems;
  const colors = Object.fromEntries(sys.map((s, i) => [s, PALETTE[i % PALETTE.length]]));

  // ── Build HTML sections ────────────────────────────────────────────────────
  const sysCards = sys.map((s) => {
    const sp = d.specs[s];
    const col = colors[s];
    return `
    <div class="card" style="border-top:3px solid ${col}">
      <div class="sys-name" style="color:${col}">${shortName(s)}</div>
      <div class="sys-vendor badge" style="background:${col}22;color:${col};border:1px solid ${col}44">${sp.Vendor}</div>
      <table class="spec-table">
        ${[["CPU",sp.CPU],["Memory",sp.Memory],["Disk",sp.Disk],["OS",sp.OS],["Kernel",sp.Kernel]]
          .map(([k,v])=>`<tr><td class="spec-k">${k}</td><td class="spec-v">${v||"N/A"}</td></tr>`).join("")}
      </table>
    </div>`;
  }).join("");

  // Benchmark result sections
  const benchSections = d.testList.map((testName) => {
    const td = d.tests[testName];
    const unit = td.results[0]?.unit || "";
    const lowerIsBetter = td.proportion === "LIB";
    const sorted = [...td.results].sort((a,b) => lowerIsBetter ? a.value - b.value : b.value - a.value);
    const maxVal = Math.max(...sorted.map(r => r.value));
    const bars = sorted.map((r) => {
      const pct = maxVal > 0 ? (r.value / maxVal * 100).toFixed(1) : 0;
      const col = colors[r.system] || "#6b7280";
      return `
      <div class="bar-row">
        <div class="bar-label">${shortName(r.system)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
        <div class="bar-value">${fmtVal(r.value, unit)}</div>
      </div>`;
    }).join("");
    return `
    <div class="bench-section" id="bench-${testName.replace(/[^a-z0-9]/gi,"-")}">
      <div class="bench-header">
        <span class="bench-title">${testName}</span>
        <span class="bench-unit">${unit}</span>
        <span class="bench-dir ${lowerIsBetter ? "lib" : "hib"}">${lowerIsBetter ? "↓ Lower is Better" : "↑ Higher is Better"}</span>
      </div>
      ${td.description ? `<div class="bench-desc">${td.description}</div>` : ""}
      <div class="bars">${bars}</div>
    </div>`;
  }).join("");

  // Normalized matrix
  const matrixHeaders = sys.map((s) =>
    `<th style="color:${colors[s]};white-space:nowrap">${shortName(s)}</th>`
  ).join("");
  const avgRow = `<tr class="avg-row"><td>📊 평균 정규화 점수</td>${sys.map((s) => {
    const scores = Object.values(d.normalized[s]||{});
    const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    return `<td class="mono">${avg.toFixed(3)}</td>`;
  }).join("")}</tr>`;
  const matrixRows = d.testList.map((t, idx) =>
    `<tr class="${idx%2===0?"":"alt"}">
      <td class="test-cell">${t}</td>
      ${sys.map((s) => {
        const sc = d.normalized[s]?.[t];
        if (sc == null) return `<td>—</td>`;
        const c = HEAT(sc), bg = HEAT_BG(sc);
        return `<td><span class="heat-chip" style="background:${bg};color:${c};border:1px solid ${c}44">${sc.toFixed(2)}</span></td>`;
      }).join("")}
    </tr>`
  ).join("");

  // ── Full HTML ──────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>POUI — Phoronix Benchmark Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>
<style>
:root {
  --bg:#0f172a; --surface:#1e293b; --card:#131e2e; --border:#334155;
  --text:#e2e8f0; --muted:#94a3b8; --brand:#3b82f6; --r:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}

/* Layout */
.page{max-width:1400px;margin:0 auto;padding:24px 20px 64px}
h1{font-size:2rem;font-weight:700;letter-spacing:-0.02em}
h2{font-size:1.15rem;font-weight:600;margin:0 0 16px;display:flex;align-items:center;gap:8px}
.subtitle{color:var(--muted);font-size:.85rem;margin-top:4px}
.divider{border:none;border-top:1px solid var(--border);margin:32px 0}
.section{margin:32px 0}

/* Nav */
nav{position:sticky;top:0;z-index:99;background:var(--surface);border-bottom:1px solid var(--border);
    padding:10px 20px;display:flex;gap:12px;flex-wrap:wrap;overflow-x:auto}
nav a{color:var(--muted);text-decoration:none;font-size:.8rem;white-space:nowrap;padding:4px 8px;
      border-radius:6px;transition:background .15s,color .15s}
nav a:hover{background:#334155;color:var(--text)}

/* Stats */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px}
.stat-val{font-size:1.8rem;font-weight:700;color:var(--brand)}
.stat-lbl{font-size:.75rem;color:var(--muted);margin-top:2px}

/* Cards (system specs) */
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:14px}
.sys-name{font-size:.95rem;font-weight:600;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{display:inline-block;font-size:.7rem;font-weight:600;padding:1px 7px;border-radius:999px;margin-bottom:8px}
.spec-table{width:100%;border-collapse:collapse;font-size:.75rem}
.spec-k{color:var(--muted);padding:2px 6px 2px 0;width:70px;vertical-align:top}
.spec-v{color:var(--text);font-family:'JetBrains Mono',monospace;word-break:break-all;font-size:.68rem}

/* Benchmark bars */
.bench-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px}
.bench-header{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.bench-title{font-weight:600;font-size:.95rem}
.bench-unit{color:var(--muted);font-size:.75rem;font-family:monospace}
.bench-dir{font-size:.7rem;padding:2px 7px;border-radius:999px;font-weight:600}
.bench-dir.hib{background:#14532d33;color:#4ade80;border:1px solid #14532d}
.bench-dir.lib{background:#7c2d1233;color:#fb923c;border:1px solid #7c2d12}
.bench-desc{font-size:.75rem;color:var(--muted);margin-bottom:10px}
.bars{display:flex;flex-direction:column;gap:6px}
.bar-row{display:grid;grid-template-columns:200px 1fr 140px;align-items:center;gap:8px}
.bar-label{font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{background:#0f172a;border-radius:3px;height:18px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width .3s}
.bar-value{font-size:.72rem;font-family:monospace;color:var(--text);text-align:right}

/* Matrix */
.matrix-wrap{overflow-x:auto;border-radius:var(--r);border:1px solid var(--border)}
.matrix-wrap table{width:100%;border-collapse:collapse;font-size:.72rem}
.matrix-wrap th{padding:8px 6px;background:var(--surface);border-bottom:1px solid var(--border);font-weight:600;text-align:center}
.matrix-wrap td{padding:5px 4px;border-bottom:1px solid #1e293b;text-align:center}
.matrix-wrap tr.alt td{background:#ffffff08}
.matrix-wrap tr.avg-row td{font-weight:600;background:#1e293b99;font-family:monospace}
.test-cell{text-align:left!important;padding-left:10px!important;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
.heat-chip{display:inline-block;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:.7rem;font-weight:600}
.mono{font-family:monospace}

/* ECharts */
.echart-box{width:100%;border-radius:var(--r);overflow:hidden}

/* Legend */
.legend{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.legend-item{display:flex;align-items:center;gap:5px;font-size:.72rem;color:var(--muted)}
.legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}

/* Footer */
footer{text-align:center;color:var(--muted);font-size:.75rem;margin-top:40px;padding-top:20px;border-top:1px solid var(--border)}

@media(max-width:640px){
  .bar-row{grid-template-columns:120px 1fr 90px}
  .bar-label{font-size:.65rem}
  .bar-value{font-size:.65rem}
}
</style>
</head>
<body>
<nav>
  <a href="#overview">Overview</a>
  <a href="#systems">Systems</a>
  <a href="#benchmarks">Benchmarks</a>
  <a href="#matrix">Matrix</a>
  <a href="#radar">Radar</a>
</nav>

<div class="page">

<!-- Header -->
<div class="section" id="overview">
  <h1>📈 POUI</h1>
  <div class="subtitle">Phoronix Benchmark Analytics Platform — Generated ${new Date().toLocaleString("ko-KR")}</div>
  <br>
  <div class="stats-row">
    <div class="stat"><div class="stat-val">${sys.length}</div><div class="stat-lbl">테스트 서버</div></div>
    <div class="stat"><div class="stat-val">${d.testList.length}</div><div class="stat-lbl">벤치마크 항목</div></div>
    <div class="stat"><div class="stat-val">${Object.keys(d.stressSuites).length}</div><div class="stat-lbl">Stress-NG 슈트</div></div>
    <div class="stat"><div class="stat-val">${[...new Set(sys.map(s=>d.specs[s]?.Vendor||"?"))].length}종</div><div class="stat-lbl">벤더 (DELL/HP)</div></div>
  </div>
  <!-- Legend -->
  <div class="legend">
    ${sys.map(s=>`<div class="legend-item"><div class="legend-dot" style="background:${colors[s]}"></div><span>${shortName(s)}</span></div>`).join("")}
  </div>
</div>

<hr class="divider">

<!-- Overall Score Chart -->
<div class="section" id="radar">
  <h2>📊 전체 정규화 점수 (평균)</h2>
  <div class="echart-box" id="chart-overall" style="height:${Math.max(200, sys.length*36+60)}px"></div>
</div>

<hr class="divider">

<!-- Systems -->
<div class="section" id="systems">
  <h2>🖥️ 시스템 사양</h2>
  <div class="cards-grid">${sysCards}</div>
</div>

<hr class="divider">

<!-- Benchmarks -->
<div class="section" id="benchmarks">
  <h2>📈 벤치마크 결과</h2>
  ${benchSections}
</div>

<hr class="divider">

<!-- Matrix -->
<div class="section" id="matrix">
  <h2>🗂️ 정규화 비교 매트릭스</h2>
  <p style="font-size:.75rem;color:var(--muted);margin-bottom:12px">최저 성능 = 1.00 기준 / 색상: 🔴 1.00 → 🟠 1.01~1.49 → 🔵 1.50~1.99 → 🟢 ≥2.00</p>
  <div class="matrix-wrap">
    <table>
      <thead><tr><th>테스트</th>${matrixHeaders}</tr>${avgRow}</thead>
      <tbody>${matrixRows}</tbody>
    </table>
  </div>
</div>

<footer>POUI v2.0 — Phoronix Benchmark Analytics Platform · ${new Date().getFullYear()}</footer>
</div>

<script>
(function(){
  const DATA = ${JSON.stringify({ systems: d.systems, normalized: d.normalized, summary: d.summary, testList: d.testList })};
  const COLORS = ${JSON.stringify(colors)};
  const shortName = (n) => n.replace(/^Intel\\s+/i,"").replace(/^AMD\\s+/i,"");

  // Overall bar chart
  const summary = DATA.summary.filter(s => DATA.systems.includes(s.system));
  summary.sort((a,b) => b.avg - a.avg);
  const overallChart = echarts.init(document.getElementById("chart-overall"), "dark");
  overallChart.setOption({
    backgroundColor:"transparent",
    tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:"#1e293b",borderColor:"#334155",textStyle:{color:"#e2e8f0",fontSize:12}},
    grid:{left:"2%",right:"6%",top:"4%",bottom:"4%",containLabel:true},
    xAxis:{type:"value",axisLabel:{color:"#64748b",fontSize:11},splitLine:{lineStyle:{color:"#1e293b"}}},
    yAxis:{type:"category",data:summary.map(s=>shortName(s.system)),axisLabel:{color:"#94a3b8",fontSize:11},inverse:true},
    series:[{type:"bar",data:summary.map(s=>({value:+s.avg.toFixed(4),itemStyle:{color:COLORS[s.system],borderRadius:[0,4,4,0]}})),
      barMaxWidth:26,label:{show:true,position:"right",color:"#94a3b8",fontSize:11,formatter:p=>p.value.toFixed(3)}}]
  });
  window.addEventListener("resize",()=>overallChart.resize());
})();
</script>
</body>
</html>`;

  fs.writeFileSync(OUT_FILE, html, "utf-8");
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`Saved ${OUT_FILE} (${kb} KB)`);
  console.log(`Systems: ${d.systems.length}, Tests: ${d.testList.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
