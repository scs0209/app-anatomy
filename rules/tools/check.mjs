#!/usr/bin/env node
// 규칙 파일을 검사한다. Rust 없이 돈다: 저장소에 실린 해석기(dist/anatomy_core.wasm)의 검증을 그대로 쓴다.
//   node rules/tools/check.mjs [규칙 파일…]     파일을 주지 않으면 rules/builtin 과 rules/imported 전부
// 검사하는 것: 형식과 모르는 필드, id의 글자·중복·정렬, 대상마다 허용된 일치 방식, 글롭과 접두어의 규칙, https 링크.
// 덧붙여 서로 다른 규칙이 똑같은 조건을 가졌는지 본다(어느 쪽이 맞을지 순서에 달리게 된다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCore } from "../../host/loader.mjs";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
let files = process.argv.slice(2);
if (!files.length) for (const d of ["rules/builtin", "rules/imported"]) for (const f of fs.readdirSync(path.join(root, d)).sort()) if (f.endsWith(".json")) files.push(path.join(root, d, f));
const module = await WebAssembly.compile(fs.readFileSync(path.join(root, "dist/anatomy_core.wasm")));
const core = createCore(module, { entries: [], read: () => 0, linkTarget: () => null });
let bad = 0, rules = 0; const seen = new Map();
for (const f of files) {
  const text = fs.readFileSync(f), r = core.addRules(text), rel = path.relative(root, f);
  if (!r.ok) { bad++; console.error(`FAIL ${rel}\n     ${r.error.code}: ${r.error.message}`); continue; }
  const doc = JSON.parse(text); rules += doc.rules.length;
  for (const rule of doc.rules) for (const m of rule.match) {
    const key = [m.target, m.type, m.value, (m.packaging || []).join(",")].join("|"), prev = seen.get(key);
    if (prev && prev !== rule.id) { bad++; console.error(`FAIL ${rel}\n     rules "${prev}" and "${rule.id}" have the same condition: ${m.target} ${m.type} "${m.value}"`); }
    seen.set(key, rule.id);
  }
  console.log(`ok   ${rel}  (${doc.rules.length} rules)`);
}
console.log(bad ? `\n${bad} problem(s)` : `\n${rules} rules in ${files.length} file(s), no problems`);
process.exit(bad ? 1 : 0);
