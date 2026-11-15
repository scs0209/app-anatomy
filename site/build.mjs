// 정적 사이트를 site-dist/ 에 모은다. 사용법: node site/build.mjs
// 한 폴더만 올리면 되도록 코어, 로더, 규칙, 샘플을 함께 복사한다. 외부 주소는 하나도 참조하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, ".."), out = path.join(root, "site-dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "style.css", "fonts.css", "main.js", "layout.js", "viewer.js", "flat.js", "card.js", "worker.js"]) fs.copyFileSync(path.join(here, f), path.join(out, f));
// three.js와 글꼴은 저장소에 실린 것을 그대로 복사한다(vendor/three/LICENSE, fonts/LICENSE-*.txt).
// 갤러리: 결과 JSON과 목록. 목록은 node site/gallery.mjs 로 다시 만든다.
for (const d of ["vendor", "fonts", "gallery"]) fs.cpSync(path.join(here, d), path.join(out, d), { recursive: true });
fs.copyFileSync(path.join(root, "host/loader.mjs"), path.join(out, "loader.mjs"));
fs.copyFileSync(path.join(root, "dist/anatomy_core.wasm"), path.join(out, "anatomy_core.wasm"));
// 규칙 파일들을 문자열 배열 하나로 묶는다. 코어가 하나씩 읽고 검증한다.
const rules = [];
for (const dir of ["rules/builtin", "rules/imported"]) for (const f of fs.readdirSync(path.join(root, dir)).sort()) if (f.endsWith(".json")) rules.push(fs.readFileSync(path.join(root, dir, f), "utf8"));
fs.writeFileSync(path.join(out, "rules.json"), JSON.stringify(rules));
let total = 0;
const size = p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : fs.statSync(p).size;
for (const f of fs.readdirSync(out).sort()) { const n = size(path.join(out, f)); total += n; console.log(String(n).padStart(9), f); }
console.log(String(total).padStart(9), "total (uncompressed)");
