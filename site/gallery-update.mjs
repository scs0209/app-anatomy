// 갤러리를 새 릴리스로 갱신한다. CI(.github/workflows/gallery.yml)가 주마다 돌리고, 손으로도 돌릴 수 있다.
//   node site/gallery-update.mjs [--only <이름>]… [--dry-run] [--force] [--report <파일>]
//   --only     그 앱만(이름은 gallery/의 파일 이름에서 .json을 뺀 것). 여러 번 쓸 수 있다
//   --dry-run  새 릴리스가 있는지만 본다. 내려받지도 고치지도 않는다
//   --force    버전이 같아도 다시 내려받아 해석한다(도구나 규칙이 바뀐 뒤)
//   --report   무엇이 바뀌었는지 Markdown으로 쓴다(PR 본문용)
// 앱마다 apps.json의 releaseRepo(릴리스가 올라오는 저장소), tag(버전을 괄호로 잡는 정규식), asset(받을 파일 이름의 정규식)을 따른다.
// 내려받은 파일은 실행하지 않는다. 명령줄 도구가 읽기만 하고, 끝나면 지운다.
// 환경 변수 GITHUB_TOKEN이 있으면 GitHub API에 쓴다(없어도 되지만 시간당 요청 수가 적다).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, ".."), dir = path.join(here, "gallery");
const MAX_BYTES = 1.5e9; // 이보다 큰 파일은 받지 않는다
const args = process.argv.slice(2), only = [], opt = { dry: false, force: false, report: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--only") only.push(args[++i]); else if (a === "--dry-run") opt.dry = true; else if (a === "--force") opt.force = true; else if (a === "--report") opt.report = args[++i];
  else { console.error("unknown option " + a); process.exit(2); }
}
const headers = { "User-Agent": "app-anatomy-gallery", Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: "Bearer " + process.env.GITHUB_TOKEN } : {}) };
async function api(p) {
  const r = await fetch("https://api.github.com" + p, { headers });
  if (!r.ok) throw new Error(`GitHub API ${p}: ${r.status} ${r.statusText}`);
  return r.json();
}
const fmt = b => (b / 1e6).toFixed(1) + " MB";
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

// 그 앱의 가장 높은 버전의 정식 릴리스(초안과 시험판 제외) 가운데, 받을 파일이 올라와 있는 것
async function latest(app) {
  const tagRe = new RegExp(app.tag), assetRe = new RegExp(app.asset); let best = null;
  for (let page = 1; page <= 3; page++) {
    const list = await api(`/repos/${app.releaseRepo}/releases?per_page=100&page=${page}`);
    for (const r of list) {
      if (r.draft || r.prerelease) continue;
      const m = tagRe.exec(r.tag_name); if (!m) continue;
      const asset = r.assets.find(x => assetRe.test(x.name)); if (!asset) continue;
      if (!best || cmp(m[1], best.version) > 0) best = { version: m[1], tag: r.tag_name, asset };
    }
    if (best || list.length < 100) break;
  }
  return best;
}
async function download(asset, into) {
  if (asset.size > MAX_BYTES) throw new Error(`${asset.name} is ${fmt(asset.size)}, over the ${fmt(MAX_BYTES)} limit`);
  const r = await fetch(asset.browser_download_url, { headers: { "User-Agent": headers["User-Agent"] } });
  if (!r.ok || !r.body) throw new Error(`download ${asset.name}: ${r.status}`);
  const file = path.join(into, asset.name), out = fs.createWriteStream(file); let n = 0;
  for await (const chunk of r.body) { n += chunk.length; if (n > MAX_BYTES) { out.destroy(); throw new Error(asset.name + " grew past the size limit"); } if (!out.write(chunk)) await new Promise(res => out.once("drain", res)); }
  await new Promise((res, rej) => out.end(e => e ? rej(e) : res()));
  if (n !== asset.size) throw new Error(`${asset.name}: got ${n} bytes, GitHub lists ${asset.size}`);
  return file;
}
// 결과가 갤러리에 넣을 만한지: 잎의 합이 전체와 같고, 구성 요소가 있다
function check(doc) {
  let sum = 0, leaves = 0;
  (function walk(n) { if (n.children && n.children.length) return n.children.forEach(walk); sum += n.bytes; leaves++; })(doc.root);
  if (sum !== doc.completeness.totalBytes) throw new Error(`leaf bytes ${sum} differ from total ${doc.completeness.totalBytes}`);
  if (leaves < 2) throw new Error("no components were found");
}

const appsPath = path.join(dir, "apps.json"), apps = JSON.parse(fs.readFileSync(appsPath, "utf8"));
const id = a => a.file.replace(/\.json$/, ""), unknown = only.filter(x => !apps.some(a => id(a) === x));
if (unknown.length) { console.error("no such app: " + unknown.join(", ")); process.exit(2); }
const changed = [], failed = [], notes = [];
for (const app of apps) {
  if (only.length && !only.includes(id(app))) continue;
  let tmp = null;
  try {
    const rel = await latest(app);
    if (!rel) throw new Error(`no release in ${app.releaseRepo} matches tag /${app.tag}/ with asset /${app.asset}/`);
    const newer = cmp(rel.version, app.version) > 0;
    console.log(`${id(app).padEnd(20)} ${app.version.padEnd(10)} latest ${rel.version.padEnd(10)} ${newer ? "NEW" : "same"}  ${rel.asset.name} ${fmt(rel.asset.size)}`);
    if (!newer && !opt.force) continue;
    if (opt.dry) { if (newer) changed.push(`${app.title} (${app.platform}): ${app.version} → ${rel.version} (not downloaded: dry run)`); continue; }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anatomy-gallery-")); // 앱마다 새 빈 폴더
    const file = await download(rel.asset, tmp), out = path.join(tmp, "result.json");
    const run = spawnSync(process.execPath, [path.join(root, "cli/anatomy.mjs"), file, "--json", out], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`analysis failed (exit ${run.status}): ${(run.stderr || "").trim().split("\n")[0]}`);
    const raw = fs.readFileSync(out), doc = JSON.parse(raw), before = JSON.parse(fs.readFileSync(path.join(dir, app.file), "utf8"));
    check(doc);
    const rt = d => d.runtimes.map(r => r.runtime).sort().join("+"), T0 = before.completeness.totalBytes, T1 = doc.completeness.totalBytes;
    // 사람이 볼 만한 변화는 보고서에 적는다. 막지는 않는다.
    if (rt(doc) !== rt(before)) notes.push(`**${app.title} (${app.platform})**: runtime changed from \`${rt(before)}\` to \`${rt(doc)}\`. Check before merging.`);
    if (Math.abs(T1 - T0) / T0 > 0.3) notes.push(`**${app.title} (${app.platform})**: uncompressed size changed by ${Math.round(100 * (T1 - T0) / T0)}% (${fmt(T0)} → ${fmt(T1)}).`);
    if (doc.warnings.length) notes.push(`${app.title} (${app.platform}): ${doc.warnings.length} warning(s) from the analyzer.`);
    const same = Buffer.compare(raw, fs.readFileSync(path.join(dir, app.file))) === 0;
    fs.writeFileSync(path.join(dir, app.file), raw);
    const was = app.version;
    app.version = rel.version; app.release = `https://github.com/${app.releaseRepo}/releases/tag/${encodeURIComponent(rel.tag)}`;
    // GitHub가 표시하는 라이선스가 바뀌었으면 따라간다. LICENSE 파일에서 읽은 것(licenseBasis: file)은 손대지 않고 알리기만 한다.
    if (app.licenseBasis === "github") {
      const spdx = ((await api(`/repos/${app.repo}`)).license || {}).spdx_id;
      if (spdx && spdx !== "NOASSERTION" && spdx !== app.license) { notes.push(`**${app.title}**: license shown by GitHub changed from ${app.license} to ${spdx}.`); app.license = spdx; }
    } else notes.push(`${app.title} (${app.platform}): license "${app.license}" was read from the LICENSE file by hand; re-read it for this release.`);
    if (!same || was !== app.version) changed.push(`${app.title} (${app.platform}): ${was} → ${rel.version}, ${fmt(T0)} → ${fmt(T1)} uncompressed, tool ${doc.toolVersion}`);
    else console.log(`${id(app).padEnd(20)} re-analyzed: identical result`);
  } catch (e) {
    failed.push(`${app.title} (${app.platform}): ${e.message}`); console.error(`${id(app)}: ${e.message}`);
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (!opt.dry) fs.writeFileSync(appsPath, "[\n" + apps.map(a => "  " + JSON.stringify(a)).join(",\n") + "\n]\n");
const report = [
  changed.length ? "## Updated\n\n" + changed.map(x => "- " + x).join("\n") : "No app has a newer release.",
  notes.length ? "## Look at these\n\n" + notes.map(x => "- " + x).join("\n") : "",
  failed.length ? "## Failed (left as they were)\n\n" + failed.map(x => "- " + x).join("\n") : "",
  "Made by `site/gallery-update.mjs`. The downloaded files were read by the analyzer, never run, and deleted.",
].filter(Boolean).join("\n\n") + "\n";
if (opt.report) fs.writeFileSync(opt.report, report);
console.log("\n" + report);
// 하나라도 실패했으면 3으로 끝낸다(갱신된 것은 그대로 둔다). CI는 이 값을 보고 PR에 표시한다.
process.exit(failed.length ? 3 : 0);
