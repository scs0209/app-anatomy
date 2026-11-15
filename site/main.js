// 사이트: 놓기, Worker, 화면 상태(계획 10.11), 오류 화면, 3D 분해도(viewer.js)와 부품 목록.
// 입력에서 온 문자열은 모두 textContent로만 넣는다.

const HARD_TIMEOUT_MS = 30000; // 코어의 기한(10초)에 더해 메인 스레드가 Worker를 종료하는 시간
const MAX_CHILDREN = 200;
const VIEWER_SCHEMA = 1;

const STR = {
  en: {
    pitch: "Drop an app to see what it is made of",
    dropText: "Drop an app here", pick: "Choose a file", dropNow: "Drop it",
    folderHint: "A .app folder works too. A ZIP of it gives exact sizes.",
    privacy: "Files never leave this device.",
    formats: ".app · .zip · .apk · .ipa", browsers: "Checked in Chromium-based browsers. Safari and Firefox are not verified yet.",
    loading: "Getting ready…", backSample: "Back to the sample", sample: "Sample",
    stage_open: "Opening", stage_runtime: "Detecting the runtime", stage_analyzing: "Analyzing the contents", detected: "Detected: {0}",
    cancel: "Cancel", uncompressed: "uncompressed size", identified: "identified {0}", opaque: "not looked inside {0}",
    approximate: "approximate", approxHint: "Links could not be told apart in a dropped folder. A ZIP gives exact sizes.",
    copies: "{0} copies of the same native code · one device uses one copy ({1})",
    warnings: "{0} warning(s)", encrypted: "The code is encrypted, so only the structure is visible.",
    unsupportedRuntime: "detected only: {0}", unidHalf: "Within the identified {0}: ", contribute: "More than half is unidentified. Rules can be contributed.",
    save: "Save result JSON", hashing: "Computing the hash…", saved: "Saved",
    sampleTitle: "{0}, opened like a chip", close: "Close", open: "Open", hint: "Drag the board to rotate. Drag a block out to remove it.", dropOut: "Drop to take it out",
    whatIfRemoved: "{0} taken out:", whatIfUndo: "Put the last one back", whatIfReset: "Put everything back", whatIfNote: "This only recounts size. It does not mean the app would still work without them.", shareElectron: "What if the {0} Electron apps shared one copy?", layersLabel: "Layers", colorsLabel: "Colors",
    layer0: "App", layer1: "Runtime", layer2: "Libraries", layer3: "Modules", layerTitle: "Show up to the {0} layer, or remove it",
    keyCaption: "Largest parts · {0} · uncompressed size", partsTitle: "All parts", partsSub: "The same parts as the chip, as a list. Point at a row to light it up on the chip.",
    galleryTitle: "Gallery", gallerySub: "{0} open-source apps, analyzed with this tool ({1}). Choose one to open it on the board.", galleryNote: "Licenses are each project's own, as shown on GitHub on 2026-11-15. Parts inside an app carry their own licenses. These are measurements of the released files, not the files. This project is not affiliated with these apps.", sourceLabel: "Source", releaseOf: "release {0}", sourceOf: "Source of {0}: {1} on GitHub",
    galleryLoading: "Opening {0}…", galleryFail: "{0} could not be opened.",
    scanTitle: "{0} apps on this Mac", scanName: "This Mac", scanRuntime: "{0}: {1} apps, {2}", scanElectron: "Electron is installed {0} times, {1} in total.", scanMeta: "{0} on disk",
    scanSkipped: "{0} app(s) could not be analyzed and are not counted: {1}", scanLayer0: "This Mac", scanLayer1: "Apps", keyCaptionScan: "Largest apps · size on disk",
    scanHint: "Whole Mac: run node cli/scan.mjs, then drop the file it writes here.", badJson: "This JSON file is not a result made by this tool.",
    copyLink: "Copy link", linkCopied: "Link copied",
    card: "Save share card", cardSaved: "Saved a 1200×630 image", cardFail: "The card could not be made.",
    searchPh: "Find by name", searchCount: "{0} found · {1} · {2}", searchNone: "No part has “{0}” in its name.",
    nogl: "This browser cannot draw the 3D view. The parts table and the list still work.", flatHint: "Tap a block to see its name.", flatAlt: "Treemap of {0}: area is bytes, color is origin.", alt: "Exploded view of {0}: a chip on a board, opened into layers.",
    others: "{0} more", ignored: "{0} other file(s) were not accepted.", dismiss: "Dismiss", noComponents: "No components were found.",
    kind_app: "app", kind_runtime: "runtime", kind_library: "library", kind_module: "", kind_container: "bundle", kind_overhead: "overhead", kind_shared: "shared", kind_link: "link", "kind_parse-failed": "could not be parsed",
    "o_app-code": "app code", "o_bundled-app-code": "bundled app code", o_library: "external library", o_runtime: "runtime", o_asset: "asset", o_unidentified: "unidentified", o_overhead: "overhead",
    rt_electron: "Electron", rt_flutter: "Flutter", "rt_react-native": "React Native", rt_native: "Native (no other runtime detected)", rt_compose: "Compose (on Android, not distinguishable from Jetpack Compose)",
    errTitle: "This could not be analyzed", tryAnother: "Choose another file", copyDiag: "Copy diagnostics", copied: "Copied", code: "Error code",
    E_UNSUPPORTED_FORMAT: "This is not a supported app file. Supported: a .app folder, a ZIP containing a .app, an APK, an IPA. If the app is inside another archive, extract it once first.",
    E_MULTIPLE_APPS: "Several apps were found. Choose one.",
    E_TOO_LARGE: "This app has more parts than this version can handle. The command-line tool has the same limit.",
    E_LIMIT_EXCEEDED: "The analysis took too long and was stopped. The command-line tool allows more time.",
    E_CORRUPT_INPUT: "The file looks damaged and could not be read.", E_IO: "The file could not be read. It may have been moved or deleted.",
    E_RULES_INVALID: "A rule file is invalid.", E_INTERNAL: "Something went wrong inside the analyzer.",
    E_NEWER_SCHEMA: "This file was made by a newer version.",
  },
  ko: {
    pitch: "앱을 놓으면 무엇으로 만들었는지 보여 줍니다",
    dropText: "여기에 앱을 놓으세요", pick: "파일 선택", dropNow: "놓으세요",
    folderHint: ".app 폴더도 됩니다. ZIP으로 압축해 넣으면 크기가 정확합니다.",
    privacy: "파일은 이 기기를 떠나지 않습니다.",
    formats: ".app · .zip · .apk · .ipa", browsers: "Chromium 계열 브라우저에서 확인했습니다. Safari와 Firefox는 아직 확인하지 못했습니다.",
    loading: "준비 중…", backSample: "샘플로 돌아가기", sample: "샘플",
    stage_open: "열기", stage_runtime: "런타임 감지", stage_analyzing: "구성 분석", detected: "감지: {0}",
    cancel: "취소", uncompressed: "압축을 푼 크기", identified: "식별 {0}", opaque: "안쪽을 보지 못한 부분 {0}",
    approximate: "근사치", approxHint: "폴더를 놓으면 링크를 구별하지 못합니다. ZIP으로 넣으면 정확합니다.",
    copies: "같은 네이티브 코드 {0}벌 · 기기 하나가 쓰는 것은 한 벌({1})",
    warnings: "경고 {0}건", encrypted: "코드 내부는 암호화되어 구조만 보입니다.",
    unsupportedRuntime: "미지원 런타임: {0}", unidHalf: "식별된 {0} 안에서는 ", contribute: "절반 넘게 미식별입니다. 규칙을 기여할 수 있습니다.",
    save: "결과 JSON 저장", hashing: "해시 계산 중…", saved: "저장했습니다",
    sampleTitle: "칩처럼 열어 본 {0}", close: "닫기", open: "열기", hint: "빈 곳을 끌면 돌아가고, 블록을 끌어내면 빠집니다", dropOut: "놓으면 빠집니다",
    whatIfRemoved: "{0}개를 뺌:", whatIfUndo: "마지막 것 되돌리기", whatIfReset: "모두 되돌리기", whatIfNote: "크기만 다시 센 것입니다. 빼도 앱이 동작한다는 뜻은 아닙니다.", shareElectron: "Electron 앱 {0}개가 한 벌을 같이 쓴다면?", layersLabel: "층 고르기", colorsLabel: "색",
    layer0: "앱", layer1: "런타임", layer2: "라이브러리", layer3: "모듈", layerTitle: "{0} 층까지 보거나 이 층을 걷어 냅니다",
    keyCaption: "큰 부품 · {0} · 압축을 푼 크기", partsTitle: "부품 전체", partsSub: "칩과 같은 부품을 목록으로 봅니다. 줄에 올리면 칩에서 그 부품이 밝아집니다.",
    galleryTitle: "갤러리", gallerySub: "공개 앱 {0}개를 이 도구({1})로 해석한 결과입니다. 고르면 위 기판에 열립니다.", galleryNote: "라이선스는 각 프로젝트 자신의 것으로, 2026-11-15에 GitHub에 표시된 내용입니다. 앱 안의 부품은 저마다 다른 라이선스를 가집니다. 여기 있는 것은 배포 파일을 잰 결과이며 파일 자체가 아닙니다. 이 프로젝트는 이 앱들과 관계가 없습니다.", sourceLabel: "출처", releaseOf: "릴리스 {0}", sourceOf: "{0}의 출처: GitHub의 {1}",
    galleryLoading: "{0} 여는 중…", galleryFail: "{0}: 열지 못했습니다.",
    scanTitle: "이 맥의 앱 {0}개", scanName: "이 맥", scanRuntime: "{0}: 앱 {1}개, {2}", scanElectron: "Electron이 {0}벌 깔려 있고 합쳐서 {1}입니다.", scanMeta: "디스크에서 {0}",
    scanSkipped: "앱 {0}개는 해석하지 못해 합계에 넣지 않았습니다: {1}", scanLayer0: "이 맥", scanLayer1: "앱", keyCaptionScan: "큰 앱 · 디스크에서의 크기",
    scanHint: "맥 전체: node cli/scan.mjs 를 돌리고, 만들어진 파일을 여기에 놓으세요.", badJson: "이 JSON 파일은 이 도구가 만든 결과가 아닙니다.",
    copyLink: "링크 복사", linkCopied: "링크를 복사했습니다",
    card: "공유 카드 저장", cardSaved: "1200×630 그림으로 저장했습니다", cardFail: "카드를 만들지 못했습니다.",
    searchPh: "이름으로 찾기", searchCount: "{0}개 찾음 · {1} · {2}", searchNone: "“{0}”: 그런 이름의 부품이 없습니다.",
    nogl: "이 브라우저에서는 3D 분해도를 그릴 수 없습니다. 부품 표와 목록은 그대로 볼 수 있습니다.", flatHint: "블록을 누르면 이름이 보입니다.", flatAlt: "{0}의 트리맵. 면적은 바이트, 색은 출처다.", alt: "{0}의 분해도. 기판 위의 칩이 층으로 열려 있다.",
    others: "그 외 {0}개", ignored: "나머지 {0}개는 받지 않았습니다.", dismiss: "닫기", noComponents: "구성 요소를 찾지 못했습니다.",
    kind_app: "앱", kind_runtime: "런타임", kind_library: "라이브러리", kind_module: "", kind_container: "묶음", kind_overhead: "overhead", kind_shared: "shared", kind_link: "링크", "kind_parse-failed": "해석 실패",
    "o_app-code": "자체 코드", "o_bundled-app-code": "자체 코드 묶음", o_library: "외부 라이브러리", o_runtime: "런타임", o_asset: "에셋", o_unidentified: "미식별", o_overhead: "overhead",
    rt_electron: "Electron", rt_flutter: "Flutter", "rt_react-native": "React Native", rt_native: "네이티브(다른 런타임 미감지)", rt_compose: "Compose(Android에서는 Jetpack Compose와 구별되지 않음)",
    errTitle: "해석하지 못했습니다", tryAnother: "다른 파일 선택", copyDiag: "진단 정보 복사", copied: "복사했습니다", code: "오류 코드",
    E_UNSUPPORTED_FORMAT: "지원하는 앱 파일이 아닙니다. 지원: .app 폴더, .app이 든 ZIP, APK, IPA. 앱이 다른 압축 파일 안에 있으면 한 번 풀어서 넣어 주세요.",
    E_MULTIPLE_APPS: "앱이 여러 개 들어 있습니다. 하나를 고르세요.",
    E_TOO_LARGE: "이 버전이 다룰 수 있는 것보다 구성 요소가 많습니다. 명령줄 도구도 같은 상한을 받습니다.",
    E_LIMIT_EXCEEDED: "해석이 너무 오래 걸려 멈췄습니다. 명령줄 도구는 시간을 더 줍니다.",
    E_CORRUPT_INPUT: "파일이 손상된 것 같아 읽지 못했습니다.", E_IO: "파일을 읽지 못했습니다. 옮겨졌거나 지워졌을 수 있습니다.",
    E_RULES_INVALID: "규칙 파일이 올바르지 않습니다.", E_INTERNAL: "해석기 안에서 문제가 생겼습니다.",
    E_NEWER_SCHEMA: "더 새로운 버전이 만든 파일입니다.",
  },
};
// 주소에 ?lang=en 또는 ?lang=ko 를 붙이면 브라우저 설정보다 먼저 따른다.
const asked = new URLSearchParams(location.search).get("lang");
const lang = asked === "ko" || asked === "en" ? asked : (navigator.language || "en").toLowerCase().startsWith("ko") ? "ko" : "en";
document.documentElement.lang = lang;
const t = (k, ...a) => (STR[lang][k] ?? STR.en[k] ?? k).replace(/\{(\d)\}/g, (_, i) => a[+i]);

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmt = b => b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(1) + " KB";
const pct = (b, T) => T ? (100 * b / T).toFixed(b / T < 0.1 ? 1 : 0) + "%" : "0%";
const short = n => n.includes("/") ? n.slice(n.lastIndexOf("/") + 1) : n;
// 결과 노드(kind, origin)와 뷰어가 줄인 노드(k, o)를 같이 받는다
const O = n => n.origin ?? n.o, K = n => n.kind ?? n.k;
const INK = { "app-code": "app", "bundled-app-code": "app", library: "library", runtime: "runtime", asset: "asset", unidentified: "unid" };
const hatched = o => o === "bundled-app-code" || o === "unidentified";
const originWord = n => O(n) ? t("o_" + O(n)) : K(n) === "shared" ? "shared" : K(n) === "overhead" ? "overhead" : t("kind_" + K(n));
// 출처는 색만으로 알리지 않는다. 색 조각에는 같은 말을 이름으로 붙이고, 줄에는 말을 따로 쓴다.
function swatch(n) {
  const i = el("i", "chip" + (INK[O(n)] ? " o-" + INK[O(n)] : "") + (hatched(O(n)) ? " hatch" : "")), w = originWord(n);
  if (w) { i.title = w; i.setAttribute("role", "img"); i.setAttribute("aria-label", w); }
  return i;
}
const reduced = matchMedia("(prefers-reduced-motion: reduce)"), narrow = matchMedia("(max-width: 900px)");

const state = { removed: [], ready: false, module: null, rules: [], sample: null, job: 0, worker: null, timer: null, queued: null, shown: null, prev: null, toolVersion: "", rulesVersion: "", chip: null, mount: 0 };
window.__state = state; // 자동 시험용

// ---------------------------------------------------------------- 정적 글자
$("drop-text").textContent = t("loading"); $("pick-text").textContent = t("pick");
$("drop-note").textContent = t("formats") + " · " + t("privacy"); $("folder-hint").textContent = t("folderHint") + " " + t("scanHint");
$("overlay-text").textContent = t("dropNow"); $("back-sample").textContent = t("backSample");
$("hint").textContent = t("hint"); $("tabs").setAttribute("aria-label", t("layersLabel")); $("legend").setAttribute("aria-label", t("colorsLabel"));
$("foot").append(el("p", null, t("browsers")));
for (const n of [{ o: "runtime" }, { o: "library" }, { o: "app-code" }, { o: "asset" }, { o: "bundled-app-code" }, { o: "unidentified" }, { k: "overhead" }]) {
  const s = el("span"); s.append(swatch(n), originWord(n)); $("legend").append(s);
}

// ---------------------------------------------------------------- 3D 분해도
// 뷰어를 읽지 못해도(파일 없음, 오래된 브라우저) 놓기와 목록은 동작한다.
// 넓은 화면은 3D(viewer.js, three.js 포함), 좁은 화면은 2D 트리맵(flat.js). 쓰는 쪽만 내려받는다.
const mods = {};
const viewMod = flat => mods[flat] || (mods[flat] = import(flat ? "./flat.js" : "./viewer.js").catch(() => null));
const fontsReady = Promise.race([
  Promise.all([document.fonts.load('800 20px "Archivo"'), document.fonts.load('500 20px "JetBrains Mono"'), lang === "ko" ? document.fonts.load('700 20px "Pretendard Variable"', "그 밖의 개 외 가") : 0]).catch(() => 0),
  new Promise(r => setTimeout(r, 2000)),
]);
function dropChip() {
  if (state.chip) { state.chip.dispose(); state.chip = null; }
  $("stage").textContent = ""; $("tabs").textContent = ""; $("key").hidden = true; state.tops = null; state.removed = []; $("whatif").hidden = true;
}
function no3d(on, flat) { document.documentElement.classList.toggle("no3d", on); document.documentElement.classList.toggle("flat2d", !!flat); }
// ---------------------------------------------------------------- 빼 보기
// 부품을 뺐을 때 크기가 얼마가 되는지만 센다. 빼도 앱이 동작한다는 뜻이 아니다(무엇이 무엇에 기대는지는 재지 않는다).
function toggleRemoved(its) {
  const c = state.chip; if (!c || c.nogl) return;
  const cur = state.removed, all = its.every(i => cur.includes(i));
  state.removed = all ? cur.filter(i => !its.includes(i)) : cur.concat(its.filter(i => !cur.includes(i)));
  c.setRemoved(state.removed); whatIf();
}
// 맥을 훑은 결과에서 Electron 프레임워크 본체들(큰 순서). 그려진 것만.
function electronCopies(doc, c) {
  const out = [];
  (function walk(n) {
    if (n.kind === "runtime" && n.name === "Electron") { const fw = (n.children || []).filter(x => x.kind === "library" && x.origin === "runtime").sort((a, b) => b.bytes - a.bytes)[0], it = fw && c.find(fw); if (it) out.push(it); }
    else (n.children || []).forEach(walk);
  })(doc.root);
  return out.sort((a, b) => b.node.b - a.node.b);
}
function whatIf() {
  const box = $("whatif"), c = state.chip, doc = state.shown && state.shown.kind === "doc" ? state.shown.doc : null; box.textContent = "";
  if (!c || c.nogl || !doc) { box.hidden = true; return; }
  const rem = state.removed, set = new Set(rem), T = c.total;
  const top = rem.filter(it => { for (let x = it.parent; x; x = x.parent) if (set.has(x)) return false; return true; }); // 부모와 자식을 같이 뺐으면 부모만 센다
  const bytes = top.reduce((sum, it) => sum + it.node.b, 0);
  const copies = doc.scan ? electronCopies(doc, c) : [], extra = copies.slice(1), shareable = extra.length > 0 && !extra.every(i => set.has(i));
  for (const tr of $("key").tBodies[0].children) tr.classList.toggle("gone", !!tr._its && tr._its.every(i => { for (let x = i; x; x = x.parent) if (set.has(x)) return true; return false; }));
  if (!rem.length && !shareable) { box.hidden = true; return; }
  if (rem.length) {
    const sum = el("p", "sum num"); sum.append(`${fmt(T)} → `, el("b", null, fmt(T - bytes)), ` (−${pct(bytes, T)})`); box.append(sum);
    box.append(el("p", "what", t("whatIfRemoved", top.length) + " " + top.slice(-3).reverse().map(it => it.node.n === "(app)" ? originWord(it.node) : short(it.node.n)).join(", ") + (top.length > 3 ? " …" : "")));
  }
  const acts = el("div", "acts");
  if (shareable) { const b = el("button", "link", t("shareElectron", copies.length)); b.id = "share-electron"; b.addEventListener("click", () => toggleRemoved(extra.filter(i => !set.has(i)))); acts.append(b); }
  if (rem.length) {
    const undo = el("button", "link", t("whatIfUndo")), reset = el("button", "link", t("whatIfReset")); undo.id = "whatif-undo"; reset.id = "whatif-reset";
    undo.addEventListener("click", () => { state.removed = state.removed.slice(0, -1); c.setRemoved(state.removed); whatIf(); });
    reset.addEventListener("click", () => { state.removed = []; c.setRemoved([]); whatIf(); });
    acts.append(undo, reset);
  }
  box.append(acts, el("p", "fine", t("whatIfNote")));
  box.hidden = false;
}
function syncChip() {
  const c = state.chip; if (!c) return;
  for (const b of $("tabs").children) b.setAttribute("aria-pressed", String(+b.dataset.layer < c.lifted));
  $("fold").textContent = t(c.open ? "close" : "open");
  c.place(); whatIf();
}
function closeChip() { const c = state.chip; if (c && !c.nogl) { c.open = false; syncChip(); } }
async function mountChip(doc, firstLoad) {
  const mine = ++state.mount, flat = narrow.matches, V = await viewMod(flat); await fontsReady;
  if (mine !== state.mount) return;
  dropChip();
  if (!V) { no3d(true, flat); $("stage").append(el("p", "nogl", t("nogl"))); return; }
  const data = V.reduce(doc, n => t("others", n)), key = $("key"), body = key.tBodies[0];
  const base = { drift: true, noglText: t("nogl"), originWord, alt: t("alt", doc.input.name) };
  const c = state.chip = flat
    ? V.flat($("stage"), data, { originWord, swatch, labelLayer: doc.scan ? 1 : 2, hint: t("flatHint"), alt: t("flatAlt", doc.input.name) })
    : V.chip($("stage"), data, { ...base, calloutLayer: doc.scan ? 1 : 2,
        dropText: t("dropOut"), onPick: it => { if (it.layer >= 1) toggleRemoved([it]); }, // 블록을 끌어내 놓았을 때 불린다
        callouts: innerWidth >= 1560 ? 6 : innerWidth >= 1240 ? 5 : 4, // 좁을수록 라벨을 줄여 오른쪽 층 단추와 겹치지 않게 한다
        halfH: 124, halfW: 150, shiftX: -0.3, shiftY: -0.2, gap: 16,
        onHover: it => { for (const tr of body.children) tr.classList.toggle("hot", !!it && (tr._its.includes(it) || tr._its.includes(it.parent))); } });
  no3d(!!c.nogl, flat);
  // 큰 부품 표: 라이브러리 층에서 큰 순서로. 그 층이 없으면 그려진 부품 전체에서.
  const at2 = c.items.filter(i => i.layer === (doc.scan ? 1 : 2)), pool = at2.length ? at2 : c.items.filter(i => i.layer >= 1 && i.leaf);
  body.textContent = "";
  // 같은 이름(여러 ABI에 든 같은 라이브러리)은 한 줄로 합친다. 줄에 올리면 그중 가장 큰 블록이 밝아진다.
  const groups = new Map();
  for (const it of pool.sort((a, b) => b.node.b - a.node.b)) { const k = it.node.n + "|" + (it.node.o || ""), g = groups.get(k) || { its: [], bytes: 0 }; g.its.push(it); g.bytes += it.node.b; groups.set(k, g); }
  const tops = state.tops = [...groups.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 8); // 공유 카드도 이 순서를 쓴다
  for (const g of tops) {
    const tr = el("tr"), it = g.its[0]; tr._its = g.its;
    const a = el("td"); a.append(swatch(it.node));
    const b = el("td", null, short(it.node.n)); b.append(el("small", null, " · " + originWord(it.node)));
    if (g.its.length > 1) b.append(el("small", null, " ×" + g.its.length));
    tr.append(a, b, el("td", "b num", fmt(g.bytes)), el("td", "p num", pct(g.bytes, c.total))); body.append(tr);
    tr.addEventListener("mouseenter", () => { tr.classList.add("hot"); c.highlight(it); });
    tr.addEventListener("mouseleave", () => { tr.classList.remove("hot"); c.highlight(null); });
    tr.addEventListener("click", () => toggleRemoved(g.its)); // 빼 보기: 줄을 누르면 그 부품(여러 벌이면 전부)을 빼거나 되돌린다
  }
  const so = (state.shown && state.shown.opts) || {};
  key.caption.textContent = doc.scan ? t("keyCaptionScan") : t("keyCaption", [so.title || doc.input.name, so.version || doc.input.appVersion].filter(Boolean).join(" "));
  key.hidden = !body.children.length;
  // 층 단추: 부품이 있는 층만. 누르면 그 층까지 보이고, 다시 누르면 그 층을 걷어 낸다.
  const ROMAN = ["I", "II", "III", "IV", "V", "VI"], used = new Set(c.items.map(i => i.layer));
  for (let L = 0; L < c.layers; L++) {
    if (!used.has(L)) continue;
    const name = doc.scan ? (L < 2 ? t("scanLayer" + L) : t("layer" + Math.min(L - 1, 3))) : t("layer" + Math.min(L, 3)), b = el("button", "frame"); // 훑은 결과는 맨 아래가 "이 맥", 그 위가 앱이다 b.dataset.layer = L; b.title = t("layerTitle", name);
    b.append(el("i", null, ROMAN[L] || String(L + 1)), el("span", null, name));
    b.addEventListener("click", () => { c.lifted = c.lifted === L + 1 ? Math.max(1, L) : L + 1; syncChip(); });
    $("tabs").append(b);
  }
  // 처음에는 기판 위의 칩 하나. 잠시 뒤 덮개가 떠오르고 층이 열리며 회로선이 뻗는다. 움직임을 줄인 환경에서는 열린 상태를 바로 보인다.
  if (reduced.matches || c.nogl || c.flat) { c.settle(); syncChip(); }
  else { c.open = false; c.settle(); syncChip(); setTimeout(() => { if (state.chip === c && state.shown && state.shown.kind === "doc") { c.open = true; syncChip(); } }, firstLoad ? 1400 : 500); }
}
$("fold").addEventListener("click", () => { const c = state.chip; if (c) { c.open = !c.open; syncChip(); } });
narrow.addEventListener("change", () => { if (state.shown && state.shown.kind === "doc") mountChip(state.shown.doc); });

// ---------------------------------------------------------------- 결과 그리기
function topLibraries(doc) {
  const by = new Map(); // 같은 이름(여러 ABI에 든 같은 라이브러리)은 합친다
  (function walk(n) { if (n.kind === "library" && n.origin !== "unidentified") by.set(n.name, (by.get(n.name) || 0) + n.bytes); else (n.children || []).forEach(walk); })(doc.root);
  return [...by].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 3);
}
function row(n, T, path) {
  const li = el("li"), r = el("div", "row"), kids = n.children || [];
  const tw = el("button", "tw", kids.length ? "▸" : ""); tw.disabled = !kids.length;
  if (kids.length) { tw.setAttribute("aria-expanded", "false"); tw.setAttribute("aria-label", n.name); }
  const nm = el("span", "nm num", n.name + (n.encrypted ? " 🔒" : "")); nm.title = path ? path + " › " + n.name : n.name;
  if (path) nm.append(el("span", "in", "  " + path)); // 검색 결과에서는 어디에 든 부품인지 같이 보인다
  r.append(tw, swatch(n), nm, el("span", "ow", originWord(n)), el("span", "sz num", fmt(n.bytes)), el("span", "pc num", pct(n.bytes, T)));
  li.append(r);
  const light = on => {
    const c = state.chip; if (!c || c.nogl) return;
    let it = null; for (let x = n; on && x && !it; x = state.parents && state.parents.get(x)) it = c.find(x); // 작아서 묶인 부품은 그려진 가장 가까운 부모를 밝힌다
    c.highlight(it);
  };
  r.addEventListener("mouseenter", () => light(true)); r.addEventListener("mouseleave", () => light(false));
  tw.addEventListener("focus", () => light(true)); tw.addEventListener("blur", () => light(false));
  let sub = null;
  tw.addEventListener("click", () => {
    if (!sub) { sub = list(kids, T); li.append(sub); }
    const open = tw.getAttribute("aria-expanded") !== "true";
    tw.setAttribute("aria-expanded", String(open)); tw.textContent = open ? "▾" : "▸"; sub.hidden = !open;
  });
  return li;
}
function list(nodes, T) {
  const ul = el("ul", "tree"), sorted = [...nodes].sort((a, b) => b.bytes - a.bytes);
  const add = from => {
    for (const n of sorted.slice(from, from + MAX_CHILDREN)) ul.append(row(n, T));
    if (sorted.length > from + MAX_CHILDREN) {
      const more = el("button", "link more", t("others", sorted.length - from - MAX_CHILDREN));
      more.addEventListener("click", () => { more.remove(); add(from + MAX_CHILDREN); });
      ul.append(more);
    }
  };
  add(0);
  return ul;
}
// 갤러리 앱의 출처 한 줄: 저장소, 릴리스, 라이선스
function sourceLine(app) {
  const line = el("p", "meta src"), repo = el("a", null, app.repo), rel = el("a", null, t("releaseOf", app.version));
  for (const [link, href] of [[repo, app.source], [rel, app.release]]) { link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; }
  line.append(t("sourceLabel") + " ", repo, " · ", rel, " · ", el("span", "num", app.license)); return line;
}
function renderDoc(doc, opts = {}) {
  if (doc.schemaVersion > VIEWER_SCHEMA) return renderError({ code: "E_NEWER_SCHEMA", message: "" });
  const head = $("head"), detail = $("detail"); head.textContent = ""; detail.textContent = "";
  const T = doc.completeness.totalBytes, c = doc.completeness;
  // 첫 화면: 앱 이름, "<런타임>. <상위 구성 3개>", 크기와 식별 비율
  const rts = doc.runtimes.map(r => r.dissected ? t("rt_" + r.runtime) : t("unsupportedRuntime", t("rt_" + r.runtime))).join(", ");
  const top = topLibraries(doc).map(l => `${l.name === "(app)" ? t("o_bundled-app-code") : short(l.name)} ${pct(l.bytes, T)}`).join(" · "); // "(app)"은 코어가 앱 자체 코드 묶음에 붙이는 이름이다
  const unidHalf = c.unidentifiedBytes > T / 2;
  // 갤러리에서 연 것은 표시 이름과 버전을 목록에서 받는다(APK는 결과 안의 이름이 파일 이름이다)
  const shownName = doc.scan ? t("scanName") : opts.title || doc.input.name, shownVersion = opts.version || doc.input.appVersion || "";
  if (opts.sample) head.append(el("p", "eyebrow", opts.eyebrow || t("sample")));
  const title = doc.scan ? t("scanTitle", doc.scan.apps.length) : opts.title ? shownName : opts.sample ? t("sampleTitle", doc.input.name) : doc.input.name;
  head.append(el("h1", "display" + (title.length > 16 ? " long" : ""), title));
  const lede = el("p", "lede");
  if (doc.scan) {
    // 훑은 결과: 같은 런타임이 몇 벌 깔렸는지가 첫 문장이다. Electron 런타임마다 그 안의 가장 큰 런타임 라이브러리(프레임워크 본체)를 센다.
    // 이름으로 찾지 않는다: 앱이 프레임워크 이름을 바꿔 싣기도 한다.
    let copies = 0, bytes = 0;
    (function walk(n) {
      if (n.kind === "runtime" && n.name === "Electron") { const fw = (n.children || []).filter(x => x.kind === "library" && x.origin === "runtime").sort((a, b) => b.bytes - a.bytes)[0]; if (fw) { copies++; bytes += fw.bytes; } }
      else (n.children || []).forEach(walk);
    })(doc.root);
    if (copies > 1) lede.append(el("b", null, t("scanElectron", copies, fmt(bytes))), " ");
    lede.append(doc.runtimes.map(r => t("scanRuntime", t("rt_" + r.runtime).replace(/\s*\(.*\)$/, ""), r.apps, fmt(r.appBytes))).join(" · "));
  } else lede.append(el("b", null, rts + "."), " " + (unidHalf ? t("unidHalf", pct(T - c.unidentifiedBytes, T)) : "") + top);
  head.append(lede);
  const meta = el("p", "meta num", `${doc.scan ? t("scanMeta", fmt(T)) : `${fmt(T)} (${t("uncompressed")})`} · ${t("identified", pct(T - c.unidentifiedBytes, T))} · ${t("opaque", pct(c.opaqueBytes, T))}`);
  if (doc.input.approximate) { const b = el("span", "badge", t("approximate")); b.title = t("approxHint"); meta.append(b); }
  head.append(meta);
  const app = opts.app || (opts.sample && state.apps ? state.apps.find(x => x.file === SAMPLE_FILE) : null);
  if (app && app.source) head.append(sourceLine(app));
  // 아래: 알림, 저장, 부품 전체 목록
  detail.append(el("h2", "display", t("partsTitle")), el("p", "sub", t("partsSub")));
  const notes = el("div", "notes");
  if (doc.input.approximate) notes.append(el("p", "note", t("approxHint")));
  if (doc.scan && doc.scan.skipped && doc.scan.skipped.length) notes.append(el("p", "note warn", t("scanSkipped", doc.scan.skipped.length, doc.scan.skipped.map(x => x.name).join(", "))));
  if (unidHalf) notes.append(el("p", "note", t("contribute")));
  if (doc.copies.length) {
    const one = doc.copies.find(x => /arm64/.test(x.name)) || doc.copies[0];
    notes.append(el("p", "note", t("copies", doc.copies.length, `${one.name} ${fmt(one.bytes)}`)));
  }
  let enc = false; (function walk(n) { if (n.encrypted) enc = true; (n.children || []).forEach(walk); })(doc.root);
  if (enc) notes.append(el("p", "note warn", t("encrypted")));
  if (opts.ignored) {
    const p = el("p", "note warn", t("ignored", opts.ignored) + " "), x = el("button", "link", t("dismiss"));
    x.addEventListener("click", () => p.remove()); p.append(x); notes.append(p);
  }
  if (doc.warnings.length) {
    const d = el("details", "warnings"); d.append(el("summary", null, t("warnings", doc.warnings.length)));
    const ul = el("ul"); for (const w of doc.warnings) ul.append(el("li", null, `${w.code}: ${w.message}`)); d.append(ul); notes.append(d);
  }
  if (notes.children.length) detail.append(notes);
  const actions = el("div", "actions"), done = el("span", "small"); done.setAttribute("role", "status");
  // 공유 카드: 지금 보이는 칩(좁은 화면은 트리맵)을 1200×630 PNG로 만들어 내려받는다. 이 탭 안에서 그리며 어디로도 보내지 않는다.
  const card = el("button", "btn line", t("card")); card.id = "card"; actions.append(card);
  card.addEventListener("click", async () => {
    const M = await import("./card.js").catch(() => null); if (!M) { done.textContent = t("cardFail"); return; }
    const view = state.chip && !state.chip.nogl ? state.chip : null;
    const part = g => { const n = g.its[0].node; return { name: n.n === "(app)" ? originWord(n) : short(n.n), word: originWord(n) + (g.its.length > 1 ? " ×" + g.its.length : ""), pct: pct(g.bytes, T), ink: INK[O(n)], hatch: hatched(O(n)) }; };
    const canvas = M.drawCard({
      name: shownName, version: shownVersion, runtime: rts,
      meta: `${fmt(T)} · ${t("identified", pct(T - c.unidentifiedBytes, T))}`,
      parts: (state.tops || []).map(part),
      legend: ["runtime", "library", "app-code", "asset", "unidentified"].map(o => ({ word: t("o_" + o), ink: INK[o], hatch: hatched(o) })),
    }, view);
    state.lastCard = canvas; // 자동 시험용
    canvas.toBlob(blob => {
      if (!blob) { done.textContent = t("cardFail"); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = shownName.replace(/[^\w.\- ]+/g, "_") + ".anatomy.png";
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); done.textContent = t("cardSaved");
    }, "image/png");
  });
  if (!opts.sample && !opts.loaded) { // 놓은 결과 파일은 이미 파일로 갖고 있다
    const save = el("button", "btn line", t(state.finalBytes ? "save" : "hashing"));
    save.id = "save"; save.disabled = !state.finalBytes; actions.append(save);
    save.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([state.finalBytes], { type: "application/json" }));
      a.download = doc.input.name.replace(/[^\w.\- ]+/g, "_") + ".anatomy.json";
      a.click(); URL.revokeObjectURL(a.href); done.textContent = t("saved");
    });
  }
  const linkApp = opts.app || (opts.sample && state.apps ? state.apps.find(x => x.file === SAMPLE_FILE) : null);
  if (linkApp) {
    const copy = el("button", "btn line", t("copyLink")); copy.id = "copylink"; actions.append(copy);
    copy.addEventListener("click", async () => {
      const u = appUrl(appId(linkApp)); u.searchParams.delete("lang"); // 받는 사람의 언어로 열리게 한다
      try { await navigator.clipboard.writeText(u.href); done.textContent = t("linkCopied"); } catch { done.textContent = u.href; }
    });
  }
  actions.append(done); detail.append(actions);
  document.title = opts.app ? `${opts.app.title} — App Anatomy` : opts.sample ? "App Anatomy" : `${shownName} — App Anatomy`;
  if (!(doc.root.children || []).length) detail.append(el("p", "note warn", t("noComponents")));
  else {
    // 찾기: 이름에 그 글자가 든 부품을 트리 전체에서 찾아 큰 순서로 늘어놓는다. 비우면 트리로 돌아간다.
    const index = [], parents = state.parents = new Map();
    (function walk(n, path) { for (const c of n.children || []) { parents.set(c, n); index.push({ n: c, low: c.name.toLowerCase(), path }); walk(c, path ? path + " › " + short(c.name) : short(c.name)); } })(doc.root, "");
    const tools = el("div", "tools"), q = el("input"), count = el("span", "small"), panel = el("div", "panel frame"), tree = list(doc.root.children, T);
    q.type = "search"; q.id = "q"; q.placeholder = t("searchPh"); q.setAttribute("aria-label", t("searchPh")); q.autocomplete = "off"; q.spellcheck = false;
    count.setAttribute("role", "status"); tools.append(q, count); panel.append(tree); detail.append(tools, panel);
    let timer = 0;
    const run = () => {
      const term = q.value.trim().toLowerCase(); panel.textContent = ""; if (state.chip) state.chip.highlight(null);
      if (!term) { count.textContent = ""; panel.append(tree); return; }
      const hits = index.filter(e => e.low.includes(term)).sort((a, b) => b.n.bytes - a.n.bytes);
      if (!hits.length) { count.textContent = ""; panel.append(el("p", "none", t("searchNone", q.value.trim()))); return; }
      // 합계는 겹치지 않게 센다: 부모와 자식이 같이 걸리면 부모만 더한다
      const set = new Set(hits.map(e => e.n)); let bytes = 0;
      for (const e of hits) { let inside = false; for (let x = parents.get(e.n); x && !inside; x = parents.get(x)) inside = set.has(x); if (!inside) bytes += e.n.bytes; }
      count.textContent = t("searchCount", hits.length.toLocaleString(), fmt(bytes), pct(bytes, T));
      const ul = el("ul", "tree"), add = from => {
        for (const e of hits.slice(from, from + MAX_CHILDREN)) ul.append(row(e.n, T, e.path));
        if (hits.length > from + MAX_CHILDREN) { const more = el("button", "link more", t("others", hits.length - from - MAX_CHILDREN)); more.addEventListener("click", () => { more.remove(); add(from + MAX_CHILDREN); }); ul.append(more); }
      };
      add(0); panel.append(ul);
    };
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    q.addEventListener("keydown", e => { if (e.key === "Escape" && q.value) { e.preventDefault(); q.value = ""; run(); } });
  }
  detail.hidden = false;
  state.shown = { kind: "doc", doc, opts, finalBytes: opts.sample ? null : state.finalBytes }; // 저장할 바이트를 결과와 함께 둔다(취소로 돌아왔을 때 다시 쓴다)
  markGallery(opts.file || (opts.sample ? SAMPLE_FILE : null));
  $("back-sample").hidden = !!opts.sample || !state.sample;
  mountChip(doc, !!opts.first);
}
// 해석 중과 오류: 칩은 덮개를 닫아 두고, 이전 결과의 표와 목록은 감춘다.
function away() { state.mount++; closeChip(); $("key").hidden = true; $("detail").hidden = true; $("whatif").hidden = true; }
function renderStage(stage, detected) {
  const head = $("head"); head.textContent = ""; away();
  head.append(el("h1", "display stagename", t(stage)));
  if (detected) head.append(el("p", "meta", t("detected", t("rt_" + detected))));
  const b = el("button", "btn line", t("cancel")); b.id = "cancel";
  b.addEventListener("click", cancel); const p = el("p"); p.append(b); head.append(p);
  state.shown = { kind: "stage" };
}
function renderError(error, retry) {
  const head = $("head"); head.textContent = ""; away();
  const box = el("div", "err");
  box.append(el("h1", "display", t("errTitle")), el("p", null, t(error.code) === error.code ? error.message : t(error.code)));
  if (error.code === "E_MULTIPLE_APPS" && Array.isArray(error.apps) && retry) {
    const ul = el("ul", "applist");
    for (const a of error.apps) {
      const li = el("li"), b = el("button", "btn line", `${a.name} · ${fmt(a.bytes)}`);
      b.addEventListener("click", () => retry({ app: a.name })); li.append(b); ul.append(li);
    }
    box.append(ul);
  } else {
    const b = el("button", "btn", t("tryAnother")); b.addEventListener("click", () => $("pick").click()); box.append(b);
  }
  const codeLine = el("p", "small", t("code") + ": "); codeLine.append(el("code", null, error.code)); box.append(codeLine);
  // 진단 정보: 앱의 내용물과 기기 경로는 넣지 않는다
  const diag = JSON.stringify({ code: error.code, message: error.message, toolVersion: state.toolVersion, rulesVersion: state.rulesVersion, userAgent: navigator.userAgent });
  const copy = el("button", "link", t("copyDiag")), ok = el("span", "small");
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(diag); ok.textContent = " " + t("copied"); } catch { ok.textContent = " " + diag; } });
  const p = el("p", "small"); p.append(copy, ok); box.append(p);
  head.append(box);
  state.shown = { kind: "error", error };
  $("back-sample").hidden = !state.sample;
}

// ---------------------------------------------------------------- 해석 작업
function stop() {
  if (state.worker) { state.worker.terminate(); state.worker = null; }
  clearTimeout(state.timer);
}
function cancel() {
  stop(); state.job++;
  const p = state.prev;
  if (p && p.kind === "doc") { state.finalBytes = p.finalBytes || null; renderDoc(p.doc, p.opts); } else if (state.sample) renderDoc(state.sample, { sample: true }); else { $("head").textContent = ""; state.shown = null; }
}
async function openResultFile(input) {
  let doc = null; try { doc = JSON.parse(await input.blob.text()); } catch { /* 아래에서 알린다 */ }
  const ok = doc && typeof doc.schemaVersion === "number" && doc.root && typeof doc.root.bytes === "number" && doc.completeness && Array.isArray(doc.runtimes) && doc.input;
  stop(); state.job++; opening++; setUrl(null, false);
  if (!ok) return renderError({ code: "E_NOT_A_RESULT", message: t("badJson") });
  if (state.shown && state.shown.kind === "doc") state.prev = state.shown;
  doc.copies = doc.copies || []; doc.warnings = doc.warnings || [];
  renderDoc(doc, { loaded: true, ignored: input.ignored });
}
function start(input, extra = {}) {
  if (input.blob && /\.json$/i.test(input.name || "")) return void openResultFile(input);
  if (!state.ready) { state.queued = input; return; }
  stop(); opening++; setUrl(null, false); // 놓은 파일의 결과에는 주소가 없다
  const job = ++state.job;
  if (state.shown && state.shown.kind === "doc") state.prev = state.shown;
  state.finalBytes = null;
  renderStage("stage_open");
  const worker = (state.worker = new Worker("worker.js", { type: "module" }));
  const fail = error => { if (job !== state.job) return; stop(); renderError(error, more => start(input, more)); };
  let detected = null;
  worker.onerror = e => fail({ code: "E_INTERNAL", message: e.message || "worker failed" });
  worker.onmessage = ev => {
    if (job !== state.job) return; // 가장 최근 작업의 결과만 반영한다
    const d = ev.data;
    if (d.type === "progress") {
      if (d.stage === "runtime-detected") detected = d.detail;
      renderStage(d.stage === "open" ? "stage_open" : d.stage === "analyzing" ? "stage_analyzing" : "stage_runtime", detected);
    } else if (d.type === "result") {
      clearTimeout(state.timer);
      const doc = JSON.parse(new TextDecoder().decode(d.json));
      state.toolVersion = doc.toolVersion; state.rulesVersion = doc.rulesVersion; state.lastMemoryMB = d.memoryMB;
      renderDoc(doc, { ignored: input.ignored });
    } else if (d.type === "final") {
      state.finalBytes = d.json; state.worker = null; if (state.shown && state.shown.kind === "doc") state.shown.finalBytes = d.json;
      const save = $("save"); if (save) { save.disabled = false; save.textContent = t("save"); }
    } else if (d.type === "error") fail(d.error);
  };
  state.timer = setTimeout(() => fail({ code: "E_LIMIT_EXCEEDED", message: "stopped by the page after " + HARD_TIMEOUT_MS + " ms" }), HARD_TIMEOUT_MS);
  worker.postMessage({ type: "analyze", module: state.module, rules: state.rules, name: input.name, blob: input.blob, files: input.files,
    options: { deadlineMs: 10000, maxNodes: 1000000, inputName: input.name, approximate: !!input.files, ...extra } });
}

// ---------------------------------------------------------------- 입력 받기
async function walkEntry(entry, prefix, out) {
  if (entry.isFile) out.push({ path: prefix + entry.name, file: await new Promise((res, rej) => entry.file(res, rej)) });
  else if (entry.isDirectory) {
    const rd = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => rd.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, prefix + entry.name + "/", out);
    }
  }
}
async function fromDrop(dt) {
  const items = [...(dt.items || [])].filter(i => i.kind === "file");
  const first = items[0], entry = first && first.webkitGetAsEntry ? first.webkitGetAsEntry() : null;
  const ignored = Math.max(0, (items.length || dt.files.length) - 1);
  if (entry && entry.isDirectory) {
    const files = []; await walkEntry(entry, "", files);
    return { name: entry.name, files, ignored };
  }
  const f = dt.files[0];
  return f ? { name: f.name, blob: f, ignored } : null;
}
let depth = 0;
addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); depth++; $("overlay").hidden = false; } });
addEventListener("dragover", e => { if (!$("overlay").hidden) e.preventDefault(); });
addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) $("overlay").hidden = true; });
addEventListener("drop", async e => {
  e.preventDefault(); depth = 0; $("overlay").hidden = true;
  const input = await fromDrop(e.dataTransfer);
  if (input) start(input);
});
$("pick").addEventListener("change", e => {
  const files = [...e.target.files];
  if (files.length) start({ name: files[0].name, blob: files[0], ignored: files.length - 1 });
  e.target.value = "";
});
$("back-sample").addEventListener("click", () => { showSample(); setUrl(null, true); });
// ---------------------------------------------------------------- 갤러리
// 공개 앱을 이 도구로 해석해 둔 결과. 목록(gallery/index.json)을 먼저 읽고, 고른 항목의 결과 JSON은 그때 내려받는다.
const SAMPLE_FILE = "joplin.json";
const BAR = [["runtime", "runtime"], ["library", "library"], ["app-code", "app"], ["bundled-app-code", "app"], ["asset", "asset"], ["unidentified", "unid"], ["overhead", ""]];
function markGallery(file) { for (const b of document.querySelectorAll("#gallery .gal")) { if (b.dataset.file === file) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); } }
// 앱마다의 주소: ?app=<이름>. 갤러리의 앱만 주소를 가진다. 사용자가 놓은 파일의 결과는 이 기기에만 있으므로 주소가 없다.
const appId = a => a.file.replace(/\.json$/, "");
const appUrl = id => { const u = new URL(location.href); u.hash = ""; if (id) u.searchParams.set("app", id); else u.searchParams.delete("app"); return u; };
function setUrl(id, push) {
  const u = appUrl(id); if (u.href === location.href) return;
  try { history[push ? "pushState" : "replaceState"]({ app: id || null }, "", u); } catch { /* 주소를 바꾸지 못해도 화면은 그대로 동작한다 */ }
}
let opening = 0;
async function openApp(a, push, first) {
  const mine = ++opening;
  try {
    const doc = await (await fetch("gallery/" + a.file)).json();
    if (mine !== opening) return true; // 그 사이 다른 앱을 골랐다
    stop(); state.job++; state.prev = null;
    renderDoc(doc, { sample: true, first, title: a.title, version: a.version, file: a.file, app: a, eyebrow: `${t("galleryTitle")} · ${a.platform}` });
    if (push !== null) setUrl(appId(a), push);
    if (!first) scrollTo({ top: 0, behavior: reduced.matches ? "auto" : "smooth" });
    return true;
  } catch { return false; }
}
function showSample() { stop(); state.job++; state.prev = null; if (state.sample) renderDoc(state.sample, { sample: true }); }
// 뒤로·앞으로: 주소에 적힌 앱을 다시 연다. 주소에 앱이 없으면 샘플.
addEventListener("popstate", async () => {
  const id = new URLSearchParams(location.search).get("app"), a = id && (await galleryReady || []).find(x => appId(x) === id);
  if (a) openApp(a, null); else showSample();
});
async function loadGallery() {
  let apps; try { apps = state.apps = await (await fetch("gallery/index.json")).json(); } catch { return null; } // 갤러리가 없어도 나머지는 동작한다
  if (state.shown && state.shown.kind === "doc" && state.shown.opts.sample && !state.shown.opts.app && !document.querySelector("#head .src")) { const me = apps.find(x => x.file === SAMPLE_FILE); if (me && me.source) $("head").append(sourceLine(me)); } // 샘플이 먼저 그려졌으면 출처 줄만 붙인다
  const band = $("gallery"), status = el("span", "small"), ul = el("ul", "gallist"); status.setAttribute("role", "status");
  band.append(el("h2", "display", t("galleryTitle")), el("p", "sub", t("gallerySub", apps.length, apps[0] ? apps[0].toolVersion : "")));
  for (const a of apps) {
    const li = el("li"), b = el("button", "gal"); b.dataset.file = a.file;
    const rts = a.runtimes.map(r => r.dissected ? t("rt_" + r.runtime) : t("unsupportedRuntime", t("rt_" + r.runtime))).join(", ").replace(/\s*\(.*\)$/, "");
    const name = el("span", "gn", a.title); name.append(el("span", "num", " " + a.version));
    // 출처별 바이트를 한 줄 막대로. 같은 내용을 글로도 붙인다(색만으로 알리지 않는다).
    const bar = el("span", "gbar"), words = [];
    for (const [o, ink] of BAR) { const v = a.origins[o] || 0; if (!v) continue; const i = el("i", "chip" + (ink ? " o-" + ink : "") + (hatched(o) ? " hatch" : "")); i.style.width = (100 * v / a.bytes) + "%"; bar.append(i); if (v / a.bytes >= 0.005) words.push(`${t("o_" + o)} ${pct(v, a.bytes)}`); }
    bar.setAttribute("role", "img"); bar.setAttribute("aria-label", words.join(", ")); b.title = words.join(" · ");
    b.append(name, el("span", "gp", a.platform), el("span", "gr", rts), el("span", "gs num", fmt(a.bytes)), bar);
    b.addEventListener("click", async () => {
      status.textContent = t("galleryLoading", a.title);
      status.textContent = await openApp(a, true) ? "" : t("galleryFail", a.title);
    });
    li.append(b);
    if (a.source) { // 링크는 단추 밖에 둔다
      const side = el("span", "gsrc"), link = el("a", null, a.repo + " ↗"); link.href = a.source; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", t("sourceOf", a.title, a.repo));
      side.append(el("span", "num", a.license || ""), link); li.append(side);
    }
    ul.append(li);
  }
  band.append(ul, el("p", "sub fine", t("galleryNote")), status); band.hidden = false;
  markGallery(state.shown && state.shown.kind === "doc" ? state.shown.opts.file || (state.shown.opts.sample ? SAMPLE_FILE : null) : null);
  return apps;
}
const galleryReady = loadGallery();
window.__analyze = input => start(input); // 자동 시험용: 페이지 안에서 Blob으로 해석을 시작한다

// ---------------------------------------------------------------- 첫 로드
(async () => {
  try {
    // 샘플 결과는 페이지와 같이 실려 있다. 코어를 기다리지 않고 먼저 그린다.
    // 주소에 ?app=<이름>이 있으면 샘플 대신 그 앱을 연다. 모르는 이름이면 샘플을 보이고 주소에서 지운다.
    // ?open=<파일 이름>: 같은 주소에 놓인 결과 JSON을 바로 연다(명령줄의 scan --open 이 쓴다). 이름만 받는다, 경로나 다른 주소는 받지 않는다.
    const openFile = new URLSearchParams(location.search).get("open");
    if (openFile && /^[\w.-]+\.json$/.test(openFile)) {
      const r = await fetch(openFile);
      if (r.ok) { await openResultFile({ name: openFile, blob: await r.blob() }); history.replaceState(null, "", location.pathname); fetch("gallery/" + SAMPLE_FILE).then(x => x.ok ? x.json() : null).then(d => { state.sample = d; }, () => {}); throw "opened"; }
    }
    const want = new URLSearchParams(location.search).get("app");
    const samplePromise = fetch("gallery/" + SAMPLE_FILE).then(r => r.json()).then(d => (state.sample = d));
    const a = want && (await galleryReady || []).find(x => appId(x) === want);
    if (!(a && await openApp(a, false, true))) { await samplePromise; if (want) setUrl(null, false); renderDoc(state.sample, { sample: true, first: true }); }
    else samplePromise.then(() => { if (state.shown && state.shown.kind !== "stage") $("back-sample").hidden = state.shown.kind === "doc" && !!state.shown.opts.sample; }, () => {});
  } catch { /* 샘플이 없어도 놓기는 된다 */ }
  try {
    const [wasm, rules] = await Promise.all([fetch("anatomy_core.wasm").then(r => r.arrayBuffer()), fetch("rules.json").then(r => r.json())]);
    state.module = await WebAssembly.compile(wasm);
    state.rules = rules;
    state.ready = true;
    $("drop-text").textContent = t("dropText");
    if (state.queued) { const q = state.queued; state.queued = null; start(q); }
  } catch (e) {
    renderError({ code: "E_INTERNAL", message: "the analyzer could not be loaded: " + (e && e.message || e) });
  }
})();
