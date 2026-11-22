#!/usr/bin/env node
// tokenrings: one command turns local AI coding token usage into a contribution graph (single HTML file).
// Data layer: tokscale (open source, reads local logs, uploads nothing). Zero dependencies; macOS / Linux / Windows.
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";
const HOME_DIR = path.join(os.homedir(), ".tokenrings");
const LEDGER = path.join(HOME_DIR, "ledger.json");
const locale = process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || "";
const ZH = /^zh/i.test(locale);
const t = (zh, en) => (ZH ? zh : en);
const log = (...a) => console.error(...a);

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { year: new Date().getFullYear(), open: true, out: null, from: null, clients: null, ledger: true, demo: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") { help(); process.exit(0); }
  else if (a === "-v" || a === "--version") { console.log(JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8")).version); process.exit(0); }
  else if (a === "--year") opt.year = +argv[++i];
  else if (a === "-o" || a === "--out") opt.out = argv[++i];
  else if (a === "--from") opt.from = argv[++i];
  else if (a === "--clients") opt.clients = argv[++i];
  else if (a === "--demo") opt.demo = true;
  else if (a === "--no-open") opt.open = false;
  else if (a === "--no-ledger") opt.ledger = false;
  else { log(t(`不认识的参数：${a}（--help 看用法）`, `Unknown option: ${a} (see --help)`)); process.exit(2); }
}
function help() {
  console.log(t(
`用法：npx tokenrings [选项]

  读取本机 AI 工具日志（Claude Code、Codex、Gemini/Antigravity、Hermes、Cursor、OpenCode 等 60+ 种），
  生成一个单文件 HTML 年轮图并用浏览器打开。数据只在本机。

  --year 2026        统计哪一年（默认今年）
  -o, --out 文件     输出路径（默认 ./tokenrings-<年>.html）
  --clients a,b      只统计这些来源（tokscale 的 client 名）
  --from 文件        直接用已有的 tokscale graph JSON，不再扫描日志
  --demo             用样例数据生成，不读本机日志
  --no-open          生成后不自动打开
  --no-ledger        不读写本地底账 ~/.tokenrings/ledger.json`,
`Usage: npx tokenrings [options]

  Reads local logs of your AI coding tools (Claude Code, Codex, Gemini/Antigravity, Hermes, Cursor,
  OpenCode and 60+ more), writes a single-file HTML contribution graph and opens it. Nothing is uploaded.

  --year 2026        which year (default: this year)
  -o, --out FILE     output path (default ./tokenrings-<year>.html)
  --clients a,b      only these sources (tokscale client names)
  --from FILE        use an existing \`tokscale graph\` JSON instead of scanning
  --demo             build from sample data, don't read local logs
  --no-open          don't open the browser
  --no-ledger        don't read or write ~/.tokenrings/ledger.json`));
}

const fmt = n => ZH
  ? (n >= 1e8 ? (n / 1e8).toFixed(1) + " 亿" : n >= 1e4 ? Math.round(n / 1e4) + " 万" : String(n))
  : (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));

// ---------- build days ----------
let days;
if (opt.demo) {
  days = demoDays(opt.year);
} else {
  const graph = scan();
  const ledger = mergeLedger(graph);
  days = compact(ledger);
}
if (!Object.keys(days).length) {
  log(t(`${opt.year} 年在本机没有找到任何 AI 工具的用量记录。可以先试试 npx tokenrings --demo`,
        `No AI tool usage found on this machine for ${opt.year}. Try npx tokenrings --demo`));
  process.exit(1);
}
const totals = {};
for (const out of Object.values(days)) for (const [k, a] of Object.entries(out)) totals[k] = (totals[k] || 0) + a[0] + a[1] + a[2] + a[3];
const payload = {
  generatedAt: new Date().toISOString(), year: opt.year, demo: opt.demo || undefined,
  tools: Object.keys(totals).sort((a, b) => totals[b] - totals[a]),
  fields: ["input", "output", "cacheRead", "cacheWrite", "costUSD", "messages", "topModel"], days,
};

// ---------- write single file ----------
const tpl = fs.readFileSync(path.join(HERE, "..", "template.html"), "utf8");
const json = JSON.stringify(payload).replace(/</g, "\\u003c");
const html = "<!doctype html>\n" + tpl.replace('<script src="data/data.js"></script>', `<script>window.TOKEN_DATA=${json};</script>`);
const outFile = path.resolve(opt.out || `tokenrings-${opt.year}${opt.demo ? "-demo" : ""}.html`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);

const tot = Object.values(totals).reduce((a, b) => a + b, 0);
log(t(`\n${opt.year} 年合计 ${fmt(tot)} token，${Object.keys(days).length} 天，${payload.tools.length} 个来源`,
      `\n${opt.year}: ${fmt(tot)} tokens over ${Object.keys(days).length} days from ${payload.tools.length} sources`));
for (const k of payload.tools) log(`  ${k.padEnd(14)} ${fmt(totals[k]).padStart(9)}  ${(totals[k] / tot * 100).toFixed(1)}%`);
log(t(`\n已生成 ${outFile}`, `\nWrote ${outFile}`));

if (opt.open) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [outFile]]
    : IS_WIN ? ["cmd", ["/c", "start", '""', `"${outFile}"`]]
    : ["xdg-open", [outFile]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true, windowsVerbatimArguments: IS_WIN }).unref(); } catch { /* path is printed above */ }
}

// ---------- 1. scan with tokscale ----------
function scan() {
  if (opt.from) return JSON.parse(fs.readFileSync(opt.from, "utf8"));
  const tmp = path.join(os.tmpdir(), `tokenrings-${process.pid}.json`);
  const args = ["-y", "tokscale@latest", "graph", "--since", `${opt.year}-01-01`, "--until", `${opt.year}-12-31`,
                "--output", tmp, "--no-spinner"];
  if (opt.clients) args.push("--client", opt.clients);
  log(t("正在扫描本机日志（首次运行会下载 tokscale，稍等）…", "Scanning local logs (first run downloads tokscale)…"));
  // On Windows npx is npx.cmd and must go through the shell
  const r = spawnSync(IS_WIN ? "npx.cmd" : "npx", args, { stdio: ["ignore", "ignore", "inherit"], shell: IS_WIN });
  if (r.status !== 0 || !fs.existsSync(tmp)) {
    log(t("tokscale 运行失败。需要 Node 18+ 并能访问 npm；也可以先跑 `npx tokscale graph --output x.json` 再用 --from x.json。",
          "tokscale failed. Needs Node 18+ and npm access; or run `npx tokscale graph --output x.json` and pass --from x.json."));
    process.exit(1);
  }
  const g = JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.rmSync(tmp, { force: true });
  return g;
}

// ---------- 2. local ledger: days stay counted after tools delete their logs ----------
function mergeLedger(graph) {
  const sumRows = rows => rows.reduce((s, r) => s + Object.values(r.tokens).reduce((a, b) => a + b, 0), 0);
  let ledger = {};
  if (opt.ledger) { try { ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch { ledger = {}; } }
  for (const day of graph.contributions || []) {
    const by = {};
    for (const c of day.clients || []) (by[c.client] ||= []).push(c);
    const slot = (ledger[day.date] ||= {});
    for (const [cl, rows] of Object.entries(by)) {
      if (!slot[cl] || sumRows(rows) >= sumRows(slot[cl])) slot[cl] = rows;   // logs only shrink: keep the larger copy
    }
  }
  if (opt.ledger) { fs.mkdirSync(HOME_DIR, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(ledger)); }
  return ledger;
}

// ---------- 3. compact: days[date][tool] = [input, output(+reasoning), cacheRead, cacheWrite, costUSD, messages, topModel] ----------
function compact(ledger) {
  const MERGE = { "antigravity-cli": "antigravity", "antigravity-extension": "antigravity", "micode-desktop": "micode" };
  const out = {};
  for (const [d, slot] of Object.entries(ledger).sort()) {
    if (!d.startsWith(String(opt.year))) continue;
    const day = {};
    for (const [cl, rows] of Object.entries(slot)) {
      const k = MERGE[cl] || cl;
      const a = (day[k] ||= [0, 0, 0, 0, 0, 0, {}]);
      for (const r of rows) {
        const tk = r.tokens;
        a[0] += tk.input || 0; a[1] += (tk.output || 0) + (tk.reasoning || 0);
        a[2] += tk.cacheRead || 0; a[3] += tk.cacheWrite || 0;
        a[4] += r.cost || 0; a[5] += r.messages || 0;
        a[6][r.modelId] = (a[6][r.modelId] || 0) + Object.values(tk).reduce((x, y) => x + y, 0);
      }
    }
    for (const a of Object.values(day)) {
      a[4] = Math.round(a[4] * 100) / 100;
      const m = a[6]; a[6] = Object.keys(m).sort((x, y) => m[y] - m[x])[0] || "";
    }
    out[d] = day;
  }
  return out;
}

// ---------- demo: deterministic sample data ----------
function demoDays(year) {
  let seed = 20260101;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  // tool: [model, $ per token, first month, last month, chance of use on a weekday, typical tokens per day]
  const T = {
    cursor:   ["cursor-auto",       0.9e-6, 0, 4,  .7, 1.5e7],
    claude:   ["claude-sonnet",     1.4e-6, 1, 11, .85, 5.5e7],
    gemini:   ["gemini-pro",        0.7e-6, 2, 8,  .35, 2.2e7],
    codex:    ["gpt-codex",         1.1e-6, 4, 11, .6, 4e7],
    opencode: ["kimi",              0.4e-6, 6, 11, .2, 1e7],
  };
  const out = {};
  const end = new Date(Math.min(Date.now(), new Date(year, 11, 31).getTime()));
  for (let d = new Date(year, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const m = d.getMonth(), wk = d.getDay() === 0 || d.getDay() === 6;
    const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = {};
    for (const [k, [model, usd, m0, m1, p, base]] of Object.entries(T)) {
      if (m < m0 || m > m1 || rnd() > p * (wk ? .45 : 1)) continue;
      const tot = base * (0.6 + m / 12) * Math.exp(0.8 * gauss());
      day[k] = [Math.round(tot * .055), Math.round(tot * .025), Math.round(tot * .91), Math.round(tot * .01),
                Math.round(tot * usd * 100) / 100, Math.round(tot / 4e5), model];
    }
    if (Object.keys(day).length) out[iso] = day;
  }
  return out;
}
