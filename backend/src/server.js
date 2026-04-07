"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const { parseBenchmarks } = require("./benchmarkParser");

const app = express();
const PORT = process.env.PORT || 3000;
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(__dirname, "../../results");
const PUBLIC_DIR = path.join(__dirname, "../public");

app.use(cors());
app.use(express.json());

// Cache layer
let cache = { data: null, generatedAt: null, loading: false };

async function loadData() {
  if (cache.loading) {
    await new Promise((r) => {
      const check = setInterval(() => { if (!cache.loading) { clearInterval(check); r(); } }, 100);
    });
    return;
  }
  cache.loading = true;
  try {
    console.log("Parsing benchmarks from:", RESULTS_DIR);
    const start = Date.now();
    cache.data = parseBenchmarks(RESULTS_DIR);
    cache.generatedAt = new Date().toISOString();
    console.log(`Parsed in ${Date.now() - start}ms — ${cache.data.systems.length} systems, ${cache.data.testList.length} tests`);
  } finally {
    cache.loading = false;
  }
}

// ─── API Routes ────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), cached: !!cache.data });
});

app.get("/api/data", async (req, res) => {
  try {
    if (!cache.data) await loadData();
    res.json(cache.data);
  } catch (err) {
    console.error("Parse error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/refresh", async (req, res) => {
  try {
    cache.data = null;
    await loadData();
    res.json({ success: true, generatedAt: cache.generatedAt, systems: cache.data.systems.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/systems", async (_req, res) => {
  if (!cache.data) await loadData();
  res.json({ systems: cache.data.systems, specs: cache.data.specs });
});

app.get("/api/tests", async (_req, res) => {
  if (!cache.data) await loadData();
  res.json({ testList: cache.data.testList });
});

// ─── Static Frontend ───────────────────────────────────────────────────────

const fs = require("fs");
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("<h2>POUI API Server — frontend not built yet</h2><p>Run: <code>npm run build</code> in /frontend</p>"));
}

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`POUI v2.0 running on http://localhost:${PORT}`);
  // Pre-warm cache on startup
  try { await loadData(); } catch (e) { console.warn("Pre-warm failed:", e.message); }
});
