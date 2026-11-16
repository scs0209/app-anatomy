#!/usr/bin/env node
// Print a short digest of an app-anatomy result so it can be read without loading the whole file.
// Results can be several megabytes; this prints about 50 lines.
//   node digest.mjs <result.json> [--top <n>]
// Works on a single-app result (app-anatomy <input> --json out.json) and on a Mac scan (this-mac.anatomy-scan.json).
import fs from "node:fs";
const args = process.argv.slice(2); let file = null, top = 12;
for (let i = 0; i < args.length; i++) { if (args[i] === "--top") top = Number(args[++i]) || 12; else file = args[i]; }
if (!file) { console.error("usage: node digest.mjs <result.json> [--top <n>]"); process.exit(2); }
let doc; try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("cannot read " + file + ": " + e.message); process.exit(2); }
if (!doc || !doc.root || !doc.completeness) { console.error(file + " is not an app-anatomy result"); process.exit(2); }
const T = doc.completeness.totalBytes, fmt = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(1) + " KB";
const pct = b => (T ? 100 * b / T : 0).toFixed(1) + "%", row = (b, label) => `  ${fmt(b).padStart(10)}  ${pct(b).padStart(6)}  ${label}`;
const WORD = { runtime: "runtime", library: "external library", "app-code": "the app's own code", "bundled-app-code": "the app's own code (bundle, not broken down)", asset: "asset", unidentified: "unidentified", overhead: "overhead" };
const out = [];
// bytes by origin: leaves only, so the rows add up to the total
const by = {}; (function walk(n) { if (n.children && n.children.length) return n.children.forEach(walk); const k = n.origin || "overhead"; by[k] = (by[k] || 0) + n.bytes; })(doc.root);
const merged = pick => { const m = new Map(); (function walk(n, app) { if (pick(n)) { const key = n.name + "|" + (n.origin || ""), g = m.get(key) || { name: n.name, origin: n.origin, bytes: 0, count: 0, apps: new Set() }; g.bytes += n.bytes; g.count++; if (app) g.apps.add(app); m.set(key, g); return; } for (const c of n.children || []) walk(c, app || (doc.scan && n !== doc.root && n.kind === "app" ? n.name : null) || (doc.scan && c.kind === "app" ? c.name : null)); })(doc.root, null); return [...m.values()].sort((a, b) => b.bytes - a.bytes); };

if (doc.scan) {
  out.push(`Mac scan: ${doc.scan.apps.length} apps, ${fmt(T)} on disk, ${pct(T - doc.completeness.unidentifiedBytes)} of bytes identified`);
  out.push("", "By runtime (apps, total size of those apps):");
  for (const r of doc.runtimes) out.push(`  ${String(r.apps).padStart(3)} apps  ${fmt(r.appBytes).padStart(10)}  ${r.runtime}`);
  // copies of the Electron framework: the largest runtime library inside each Electron runtime node
  let copies = 0, bytes = 0; (function walk(n) { if (n.kind === "runtime" && n.name === "Electron") { const fw = (n.children || []).filter(x => x.kind === "library" && x.origin === "runtime").sort((a, b) => b.bytes - a.bytes)[0]; if (fw) { copies++; bytes += fw.bytes; } } else (n.children || []).forEach(walk); })(doc.root);
  if (copies > 1) out.push("", `Electron framework: ${copies} separate copies, ${fmt(bytes)} together`);
  out.push("", `Largest apps (top ${Math.min(top, doc.scan.apps.length)}):`);
  for (const a of doc.scan.apps.slice(0, top)) out.push(row(a.bytes, `${a.name}${a.appVersion ? " " + a.appVersion : ""}  [${a.runtimes.join("+")}]`));
  if (doc.scan.skipped && doc.scan.skipped.length) out.push("", `Not analyzed (not counted above): ${doc.scan.skipped.map(s => s.name).join(", ")}`);
} else {
  const i = doc.input;
  out.push(`${i.name}${i.appVersion ? " " + i.appVersion : ""} (${i.packaging}): ${fmt(T)} uncompressed${i.approximate ? ", approximate" : ""}`);
  out.push(`Runtime: ${doc.runtimes.map(r => r.runtime + (r.dissected ? "" : " (detected only, not broken down)")).join(", ")}`);
  out.push(`Identified ${pct(T - doc.completeness.unidentifiedBytes)} of bytes; ${pct(doc.completeness.opaqueBytes)} attributed but not looked inside`);
  out.push("", `Largest parts (top ${top}; the same name in several copies is merged):`);
  for (const g of merged(n => n.kind === "library").slice(0, top)) out.push(row(g.bytes, `${g.name === "(app)" ? "(the app's bundled code)" : g.name}${g.count > 1 ? " ×" + g.count : ""}  [${WORD[g.origin] || g.origin || "?"}]`));
  if (doc.copies && doc.copies.length > 1) out.push("", `Native code is shipped ${doc.copies.length} times, once per CPU type: ${doc.copies.map(c => `${c.name} ${fmt(c.bytes)}`).join(", ")}. One device uses one of them.`);
}
out.push("", "Bytes by origin:");
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) out.push(row(v, WORD[k] || k));
// the outermost unidentified parts
const un = merged(n => n.origin === "unidentified").slice(0, 8);
if (un.length) { out.push("", "Largest unidentified parts (no rule names them yet):"); for (const g of un) out.push(row(g.bytes, `${g.name}${g.count > 1 ? " ×" + g.count : ""}`)); }
if (doc.warnings && doc.warnings.length) out.push("", `${doc.warnings.length} warning(s): ${doc.warnings.slice(0, 3).map(w => w.code).join(", ")}`);
out.push("", `tool ${doc.toolVersion}, rules ${doc.rulesVersion}`);
console.log(out.join("\n"));
