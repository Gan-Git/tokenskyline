// Builds pages with different data shapes for the one-screen layout check (test/fit.html).
// Usage: node test/variants.mjs  → writes test/out/*.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
fs.mkdirSync(OUT, { recursive: true });
const tpl = fs.readFileSync(path.join(HERE, "..", "template.html"), "utf8");

let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const ALL = ["claude", "codex", "gemini", "cursor", "opencode", "hermes", "workbuddy", "codebuddy", "kimi", "qwen", "copilot", "amp", "cline", "zed"];

function build(name, { from, to, tools, p = 0.8, spike = null }) {
  const days = {};
  const end = new Date(to), year = end.getFullYear();
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), day = {};
    tools.forEach((k, i) => {
      if (rnd() > p) return;
      const tot = (2e7 + rnd() * 3e8) / (i + 1);
      day[k] = [tot * .05 | 0, tot * .03 | 0, tot * .91 | 0, tot * .01 | 0, Math.round(tot * 1e-6 * 100) / 100, 10, k + "-model"];
    });
    if (spike === iso) day[tools[0]] = [1e8, 2e7, 5e9, 1e7, 900, 99, "spike-model"];
    if (Object.keys(day).length) days[iso] = day;
  }
  const payload = { generatedAt: to + "T12:00:00Z", year, tools, days };
  const html = "<!doctype html>\n" + tpl.replace('<script src="data/data.js"></script>', `<script>window.TOKEN_DATA=${JSON.stringify(payload)};</script>`);
  fs.writeFileSync(path.join(OUT, name + ".html"), html);
  return name;
}

const T = "2026-11-23";
const names = [
  build("weeks4", { from: "2026-10-27", to: T, tools: ALL.slice(0, 3) }),
  build("weeks18", { from: "2026-07-21", to: T, tools: ALL.slice(0, 8) }),
  build("fullyear", { from: "2026-01-01", to: T, tools: ALL.slice(0, 5) }),
  build("onetool", { from: "2026-03-01", to: T, tools: ["claude"] }),
  build("manytools", { from: "2026-02-10", to: T, tools: ALL }),
  build("spike", { from: "2026-05-01", to: T, tools: ALL.slice(0, 4), spike: "2026-09-09" }),
  build("oneday", { from: T, to: T, tools: ["codex"] }),
  build("sparse", { from: "2026-01-05", to: T, tools: ALL.slice(0, 2), p: 0.08 }),
];
fs.writeFileSync(path.join(OUT, "list.json"), JSON.stringify(names));
console.log("wrote", names.length, "variants to", OUT);
