// Cross-platform smoke test (run in CI on Linux, macOS and Windows).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const bin = path.join("bin", "tokenrings.mjs");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "tokenrings-"));
const env = { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env });
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${extra}`); if (!ok) failed++; };

let r = run("--help");
check("--help", r.status === 0 && r.stdout.includes("Usage"));

const demo = path.join(out, "demo.html");
r = run("--demo", "--no-open", "-o", demo);
const html = fs.existsSync(demo) ? fs.readFileSync(demo, "utf8") : "";
check("--demo writes a self-contained page", r.status === 0 && html.startsWith("<!doctype html>") && html.includes("window.TOKEN_DATA=") && !html.includes('src="data/data.js"'));

const fx = path.join(out, "fx.html");
r = run("--from", path.join("test", "fixture-graph.json"), "--year", "2026", "--no-open", "--no-ledger", "-o", fx);
const data = fs.existsSync(fx) ? JSON.parse(fs.readFileSync(fx, "utf8").match(/window\.TOKEN_DATA=(.*?);<\/script>/s)[1]) : null;
check("--from merges antigravity and counts tokens", !!data && data.tools.includes("antigravity") && data.days["2026-03-01"].claude[2] === 9000 && data.days["2026-03-01"].antigravity[1] === 25);

// Real scan path: proves npx / npx.cmd can be spawned on this OS. A CI runner has no AI logs,
// so the expected outcome is the friendly "no usage" message, not "tokscale failed".
if (!process.argv.includes("--skip-scan")) {
  r = run("--no-open", "--no-ledger", "-o", path.join(out, "scan.html"));
  const said = (r.stderr || "") + (r.stdout || "");
  check("scan via tokscale runs", r.status === 0 || said.includes("No AI tool usage"), r.status === 0 ? "(found usage)" : "(no usage on this machine, as expected in CI)");
}
process.exit(failed ? 1 : 0);
