// 실제 코어의 호스트 인터페이스 시험.
// 사용법: node host/test.mjs <ZIP 표본> <같은 앱을 푼 .app 폴더> <APK 표본> <앱이 둘 든 ZIP>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCore, INPUT_FILE, INPUT_FOLDER } from "./loader.mjs";
import { fileSource, folderSource } from "./node-host.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, "dist/anatomy_core.wasm")));
const ruleTexts = ["rules/builtin/builtin.json", "rules/imported/libchecker-rules.json"].map(f => fs.readFileSync(path.join(root, f), "utf8"));
const [zip, folder, apk, multi] = process.argv.slice(2);
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "통과 " : "실패 ") + name + (extra ? "  (" + extra + ")" : "")); if (!ok) failed++; };
const doc = r => JSON.parse(new TextDecoder().decode(r.bytes));
const make = (src, hooks) => { const c = createCore(module, src, hooks); for (const t of ruleTexts) c.addRules(t); return c; };
const walk = function* (n) { yield n; for (const c of n.children || []) yield* walk(c); };

const imports = WebAssembly.Module.imports(module).map(i => i.module + "." + i.name).sort();
check("가져오기 6개", imports.length === 6 && imports.every(i => i.startsWith("anatomy_host.")), imports.map(i => i.split(".")[1]).join(" "));
const exp = WebAssembly.Module.exports(module).map(e => e.name);
check("내보내기", ["memory", "anatomy_abi_version", "anatomy_alloc", "anatomy_free", "anatomy_init", "anatomy_analyze", "anatomy_finalize", "anatomy_result_ptr", "anatomy_result_len"].every(n => exp.includes(n)));

let zipDoc;
{
  const src = fileSource(zip), stages = [];
  const core = make(src, { onProgress: (s, d) => stages.push(d ? s + ":" + d : s) });
  const r = core.analyze(INPUT_FILE, { deadlineMs: 60000, inputName: path.basename(zip) });
  check("ZIP 해석", r.ok, r.ok ? "" : JSON.stringify(r.error));
  zipDoc = doc(r);
  check("해석 직후에는 inputSha256이 null", zipDoc.inputSha256 === null);
  check("진행 단계 순서", stages.join(" > ") === "open > analyzing > runtime-detected:Electron > done", stages.join(" > "));
  const f = core.finalizeRaw(), fin = doc(f);
  check("최종 결과의 해시가 파일의 sha256과 같음", fin.inputSha256 === crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex"));
  check("최종 결과는 해시만 다름", JSON.stringify({ ...fin, inputSha256: null }) === JSON.stringify(zipDoc));
  // 결정성: 새 인스턴스로 다시 돌리면 바이트가 같다
  const again = make(fileSource(zip)); again.analyze(INPUT_FILE, { inputName: path.basename(zip) });
  check("같은 입력은 같은 바이트의 JSON", Buffer.compare(Buffer.from(again.finalizeRaw().bytes), Buffer.from(f.bytes)) === 0, f.bytes.length + " 바이트");
  src.close();
}
{
  const src = folderSource(folder), core = make(src);
  const r = core.analyze(INPUT_FOLDER, {}), d = doc(r);
  check("폴더와 ZIP의 총량이 같음", r.ok && d.completeness.totalBytes === zipDoc.completeness.totalBytes, String(d.completeness.totalBytes));
  const strip = n => ({ k: n.kind, n: n.name, b: n.bytes, o: n.origin, c: (n.children || []).map(strip) });
  check("폴더와 ZIP의 트리가 같음(압축 크기와 링크 대상 제외)", JSON.stringify(strip(d.root)) === JSON.stringify(strip(zipDoc.root)));
  const links = [...walk(d.root)].filter(n => n.kind === "link");
  check("링크 노드에 대상이 있음", links.length > 0 && links.every(n => n.link.target.length > 0 && n.bytes === 0), links.length + "개, 예: " + links[0].link.target);
  const h1 = doc(core.finalizeRaw()).inputSha256, c2 = make(folderSource(folder)); c2.analyze(INPUT_FOLDER, {});
  check("폴더 해시가 두 번 같음", h1 && h1 === doc(c2.finalizeRaw()).inputSha256);
  src.close();
}
{
  const src = fileSource(apk); let t = 0;
  const r1 = make(src, { now: () => (t += 50) }).analyze(INPUT_FILE, { deadlineMs: 120 });
  check("기한 초과 → E_LIMIT_EXCEEDED, 상태 4", !r1.ok && r1.error.code === "E_LIMIT_EXCEEDED" && r1.status === 4, JSON.stringify(r1.error || {}));
  const r2 = make({ ...src, read: () => -1 }).analyze(INPUT_FILE, {});
  check("읽기 실패 → E_IO, 상태 2", !r2.ok && r2.error.code === "E_IO" && r2.status === 2);
  const r3 = make({ ...src, read: () => { throw new Error("boom"); } }).analyze(INPUT_FILE, {});
  check("호스트 읽기가 예외를 던져도 E_IO", !r3.ok && r3.error.code === "E_IO");
  const r4 = make(src).analyze(INPUT_FILE, { maxNodes: 10 });
  check("노드 상한 → E_TOO_LARGE, 상태 4", !r4.ok && r4.error.code === "E_TOO_LARGE" && r4.status === 4, (r4.error || {}).message);
  // 읽기가 도중에 실패하기 시작하면 부분 결과 대신 오류로 끝난다
  let n = 0;
  const r5 = make({ ...src, read: (f, o, into) => (++n > 6 ? -1 : src.read(f, o, into)) }).analyze(INPUT_FILE, {});
  check("도중의 읽기 실패 → E_IO", !r5.ok && r5.error.code === "E_IO", "읽기 " + n + "회째부터 실패");
  src.close();
  const text = new TextEncoder().encode("this is not a zip file, just some text. ".repeat(10));
  const mem = d => ({ entries: [{ path: "a.bin", size: d.length }], read: (_f, off, into) => { const s = d.subarray(off, off + into.length); into.set(s); return s.length; } });
  const r6 = make(mem(text)).analyze(INPUT_FILE, {});
  check("ZIP이 아님 → E_UNSUPPORTED_FORMAT, 상태 3", !r6.ok && r6.error.code === "E_UNSUPPORTED_FORMAT" && r6.status === 3);
}
{
  const src = fileSource(multi);
  const r = make(src).analyze(INPUT_FILE, {});
  check("앱이 여럿 → E_MULTIPLE_APPS와 앱 목록", !r.ok && r.error.code === "E_MULTIPLE_APPS" && r.status === 3 && r.error.apps.length === 2 && r.error.apps.every(a => a.name && a.bytes > 0), JSON.stringify(r.error.apps || []));
  const r2 = make(src).analyze(INPUT_FILE, { app: r.error.apps[1].name });
  check("app 옵션으로 하나를 고름", r2.ok && doc(r2).input.name === "Beta");
  src.close();
}
{
  // 줄 바꿈, 탭, 한글, 이모지, 따옴표가 든 경로
  const names = ["a\nb.txt", "tab\there.txt", "한글 파일.txt", "😀.bin", "\"quote\"\\slash.txt"], data = new Uint8Array(7);
  const src = { entries: [{ path: "App.app/Contents/MacOS/App", size: 7 }, ...names.map(n => ({ path: "App.app/Contents/Resources/" + n, size: 7 }))], read: (_f, off, into) => { const s = data.subarray(off, off + into.length); into.set(s); return s.length; }, linkTarget: () => null };
  const r = make(src).analyze(INPUT_FOLDER, {}), got = r.ok ? doc(r).root.children.map(n => n.name) : [];
  check("이상한 이름의 경로가 그대로", r.ok && names.every(n => got.includes(n)) && doc(r).completeness.totalBytes === 42, got.length + "개 노드");
}
{
  const c = createCore(module, fileSource(apk));
  const bad = c.addRules('{"formatVersion":1,"source":{"id":"user","name":"x","license":"MIT","modified":false},"rules":[{"id":"a","name":"A","kind":"library","category":"other","match":[{"target":"path","type":"glob","value":"lib/**/x.so"}]}]}');
  check("잘못된 규칙 → E_RULES_INVALID, 상태 2", !bad.ok && bad.error.code === "E_RULES_INVALID" && bad.status === 2, bad.error && bad.error.message.slice(0, 60));
  const notJson = createCore(module, fileSource(apk)).addRules("{nope");
  check("JSON이 아닌 규칙 → 줄과 칸", !notJson.ok && /line 1, column/.test(notJson.error.message), notJson.error && notJson.error.message.slice(0, 50));
  const early = createCore(module, fileSource(apk)).finalizeRaw();
  check("해석 전에 최종화 → 오류", !early.ok);
}
console.log(failed ? `실패 ${failed}건` : "모두 통과");
process.exit(failed ? 1 : 0);
