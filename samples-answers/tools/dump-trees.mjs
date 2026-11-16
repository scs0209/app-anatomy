// 표본마다 코어의 트리와 해시를 파일로 낸다. 처음에는 시제품 코어용으로 썼고, 지금의 코어로 다시 돌려 보지는 않았다. 사용법: node dump-trees.mjs <출력 폴더> <표본 파일...>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCore, INPUT_FILE } from "../../host/loader.mjs";
import { fileSource } from "../../host/node-host.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const module = await WebAssembly.compile(fs.readFileSync(path.join(here, "../../dist/anatomy_core.wasm")));
const [out, ...files] = process.argv.slice(2);
for (const f of files) {
  const src = fileSource(f);
  const core = createCore(module, src);
  const r = core.analyze(INPUT_FILE, {});
  if (!r.ok) { console.error(f, r.error); process.exit(1); }
  const id = path.basename(path.dirname(f));
  fs.writeFileSync(path.join(out, id + ".tree.json"), r.bytes);
  fs.writeFileSync(path.join(out, id + ".meta.json"), JSON.stringify({ id, file: path.basename(f), bytes: src.entries[0].size, sha256: core.finalize().inputSha256 }));
  src.close();
  console.log(id, "ok");
}
