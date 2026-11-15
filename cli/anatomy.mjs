#!/usr/bin/env node
// 앱 해부도 명령줄 도구.
//   anatomy <입력> [--json <파일|->] [--out <폴더>] [--force] [--rules <파일>]… [--no-builtin-rules] [--app <이름>] [--no-hash]
// 입력: .app 폴더, .app이 든 ZIP, APK, IPA. 파일은 이 기기 밖으로 나가지 않는다.
// 종료 코드: 0 성공(경고 포함), 2 사용법·입출력 오류, 3 지원하지 않는 입력, 4 해석 실패.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCore, INPUT_FILE, INPUT_FOLDER } from "../host/loader.mjs";
import { fileSource, folderSource } from "../host/node-host.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const USAGE = "usage: anatomy <input> [--json <file|->] [--out <dir>] [--force] [--rules <file>]... [--no-builtin-rules] [--app <name>] [--no-hash]";

function parseArgs(argv) {
  const o = { rules: [], builtin: true, hash: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(a + " needs a value"); return argv[++i]; };
    if (a === "--json") o.json = next();
    else if (a === "--out") o.out = next();
    else if (a === "--rules") o.rules.push(next());
    else if (a === "--app") o.app = next();
    else if (a === "--force") o.force = true;
    else if (a === "--no-builtin-rules") o.builtin = false;
    else if (a === "--no-hash") o.hash = false;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a.startsWith("--")) throw new Error("unknown option " + a);
    else if (o.input === undefined) o.input = a;
    else throw new Error("only one input is accepted; got a second one: " + a);
  }
  return o;
}

function die(status, code, message, asJson, extra = {}) {
  if (asJson) process.stderr.write(JSON.stringify({ code, message, ...extra }) + "\n");
  else process.stderr.write(`anatomy: ${message}\n  error code: ${code} (docs/errors.md#${code})\n`);
  process.exit(status);
}

const fmt = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : (b / 1e6).toFixed(1) + " MB";

function summary(doc) {
  const T = doc.completeness.totalBytes, pct = b => (100 * b / T).toFixed(1) + "%";
  const by = new Map(); // 같은 이름(여러 ABI에 든 같은 라이브러리)은 합친다
  (function walk(n) { if (n.kind === "library" && n.origin !== "unidentified") by.set(n.name, (by.get(n.name) || 0) + n.bytes); else (n.children || []).forEach(walk); })(doc.root);
  const libs = [...by].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes);
  const rt = doc.runtimes.map(r => r.runtime + (r.dissected ? "" : " (detected only)") + (r.bytes ? " " + pct(r.bytes) : "")).join(", ");
  const lines = [
    `${doc.input.name}${doc.input.appVersion ? " " + doc.input.appVersion : ""} · ${doc.input.packaging} · ${fmt(T)} (uncompressed)`,
    `runtime: ${rt}`,
    `largest: ${libs.slice(0, 3).map(l => `${l.name} ${pct(l.bytes)}`).join(" · ")}`,
    `identified ${pct(T - doc.completeness.unidentifiedBytes)} · not looked inside ${pct(doc.completeness.opaqueBytes)} · overhead ${pct(doc.completeness.overheadBytes + doc.completeness.sharedBytes)}`,
  ];
  if (doc.copies.length) lines.push(`${doc.copies.length} copies of native code: ${doc.copies.map(c => `${c.name} ${fmt(c.bytes)}`).join(", ")}`);
  for (const w of doc.warnings) lines.push(`warning ${w.code}: ${w.message}`);
  return lines.join("\n");
}

// 출력을 받던 쪽이 먼저 닫아도(예: `| head`) 조용히 끝낸다
process.stdout.on("error", e => { if (e.code === "EPIPE") process.exit(0); throw e; });

let o;
try { o = parseArgs(process.argv.slice(2)); } catch (e) { die(2, "E_USAGE", e.message + "\n  " + USAGE, false); }
const asJson = o.json !== undefined;
if (o.help || !o.input) { process.stdout.write(USAGE + "\n"); process.exit(o.help ? 0 : 2); }
if (Number(process.versions.node.split(".")[0]) < 18) die(2, "E_NODE_VERSION", `Node 18 or newer is required (this is ${process.versions.node})`, asJson);
if (!fs.existsSync(o.input)) die(2, "E_IO", `no such file or folder: ${o.input}`, asJson);

const isDir = fs.statSync(o.input).isDirectory();
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, "dist/anatomy_core.wasm")));
const src = isDir ? folderSource(path.resolve(o.input)) : fileSource(o.input);
const core = createCore(module, src, { onProgress: (stage, detail) => { if (!asJson && process.stderr.isTTY && stage === "runtime-detected") process.stderr.write(`detected: ${detail}\n`); } });

const ruleFiles = [...o.rules];
if (o.builtin) for (const dir of ["rules/builtin", "rules/imported"]) {
  const d = path.join(root, dir);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith(".json")) ruleFiles.unshift(path.join(d, f));
}
for (const f of ruleFiles) {
  let text;
  try { text = fs.readFileSync(f); } catch { die(2, "E_IO", `cannot read rule file: ${f}`, asJson); }
  const r = core.addRules(text);
  if (!r.ok) die(r.status ?? 4, r.error.code, `${path.basename(f)}: ${r.error.message}`, asJson);
}

let r = core.analyze(isDir ? INPUT_FOLDER : INPUT_FILE, { deadlineMs: 60000, maxNodes: 1000000, inputName: path.basename(o.input), ...(o.app ? { app: o.app } : {}) });
if (!r.ok) { const { code, message, ...extra } = r.error; die(r.status ?? 4, code, message, asJson, extra); }
let bytes = r.bytes;
if (o.hash) {
  const f = core.finalizeRaw();
  if (!f.ok) die(f.status ?? 4, f.error.code, f.error.message, asJson);
  bytes = f.bytes;
}
src.close();

if (o.json === "-") {
  process.stdout.write(Buffer.from(bytes));
  process.stdout.write("\n");
} else {
  const doc = JSON.parse(new TextDecoder().decode(bytes));
  const target = o.json ?? path.join(o.out ?? ".", doc.input.name.replace(/[^\w.\- ]+/g, "_") + ".anatomy.json");
  if (fs.existsSync(target) && !o.force) die(2, "E_IO", `${target} already exists; pass --force to overwrite`, asJson);
  try { fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true }); fs.writeFileSync(target, bytes); } catch (e) { die(2, "E_IO", `cannot write ${target}: ${e.message}`, asJson); }
  process.stdout.write(summary(doc) + `\nwrote ${target}\n`);
}
