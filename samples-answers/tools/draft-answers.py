#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""표본 12개의 정답 초안을 만든다.

사용법: python3 draft-answers.py <dump-trees.mjs 가 낸 폴더> <LibChecker 변환 규칙 파일> <출력 폴더>

바이트 수는 시제품 코어가 낸 트리에서 가져온 측정값이다. 출처(origin)는 아래 규칙으로 붙인 초안이고,
사람이 확인해야 한다. 확신이 낮은 항목은 status 를 needs-review 로 둔다."""
import io, json, os, re, sys

TREES, RULES, OUT = sys.argv[1:4]

# 표본의 고정 정보. 버전, 주소, 라이선스는 app-anatomy-samples.md 에서 옮겼다.
SAMPLES = [
    dict(id="01-joplin", app="Joplin", version="3.7.22", runtime="electron", packaging="macos-app", repo="laurent22/joplin", license=None,
         fact="메모 앱인데 AI 추론 엔진과 글자 인식 엔진이 224 MB(37%)다"),
    dict(id="02-mattermost-desktop", app="Mattermost Desktop", version="6.3.2", runtime="electron", packaging="macos-app", repo="mattermost/desktop", license="Apache-2.0",
         fact="94.3%가 Electron이고 앱 자체는 10.6 MB(3.4%)다"),
    dict(id="03-standardnotes", app="Standard Notes", version="3.202.11", runtime="electron", packaging="macos-app", repo="standardnotes/app", license="AGPL-3.0",
         fact="데스크톱 앱 안에 서버 패키지가 들어 있고 소스맵이 81.8 MB다"),
    dict(id="04-localsend", app="LocalSend", version="1.18.2", runtime="flutter", packaging="apk", repo="localsend/localsend", license="Apache-2.0", app_id="org.localsend.localsend_app",
         fact="가장 큰 조각이 Rust 라이브러리(16.7 MB)로 Flutter 엔진보다 크다"),
    dict(id="05-appflowy", app="AppFlowy", version="0.15.0", runtime="flutter", packaging="macos-app", repo="AppFlowy-IO/AppFlowy", license="AGPL-3.0",
         fact="실행 파일 하나가 157.6 MB(52.9%)다"),
    dict(id="06-immich", app="Immich", version="3.4.1", runtime="flutter", packaging="apk", repo="immich-app/immich", license="AGPL-3.0", app_id="app.alextran.immich",
         fact="사진 앱 안에 지도 엔진과 Chromium 네트워크 스택이 있다"),
    dict(id="07-mattermost-mobile", app="Mattermost Mobile", version="2.45.1", runtime="react-native", packaging="ipa", repo="mattermost/mattermost-mobile", license="Apache-2.0",
         fact="네이티브 실행 파일(49.6 MB)이 JS 번들(31.1 MB)보다 크다"),
    dict(id="08-rocketchat", app="Rocket.Chat", version="4.78.1", runtime="react-native", packaging="apk", repo="RocketChat/Rocket.Chat.ReactNative", license="MIT", app_id="chat.rocket.android",
         fact="80%(180.2 MB)가 같은 네이티브 코드의 4벌이다"),
    dict(id="09-joplin-android", app="Joplin Android", version="3.7.10", runtime="react-native", packaging="apk", repo="laurent22/joplin-android", license=None, app_id="net.cozic.joplin",
         fact="클래스 32,370개가 난독화 없이 들어 있다"),
    dict(id="10-newpipe", app="NewPipe", version="0.29.3", runtime="compose", packaging="apk", repo="TeamNewPipe/NewPipe", license="GPL-3.0", app_id="org.schabi.newpipe",
         fact="둘째로 큰 조각이 문자열 표(resources.arsc, 5.3 MB)다"),
    dict(id="11-maccy", app="Maccy", version="2.8.0", runtime="native", packaging="macos-app", repo="p0deje/Maccy", license="MIT",
         fact="앱의 4분의 1이 자동 업데이트 프레임워크(Sparkle)다"),
    dict(id="12-utm", app="UTM", version="5.0.8", runtime="native", packaging="ipa", repo="utmapp/UTM", license="Apache-2.0",
         fact="UTM 자신의 실행 파일은 10.1 MB(1.2%)이고 나머지는 에뮬레이터와 펌웨어다"),
]

RUNTIME_SO = {"libflutter.so": "flutter", "libreactnative.so": "react-native", "libhermes.so": "react-native", "libhermesvm.so": "react-native",
              "libjsi.so": "react-native", "libhermestooling.so": "react-native", "libfbjni.so": "react-native"}
RUNTIME_FW = {"Electron Framework.framework": "electron", "FlutterMacOS.framework": "flutter", "Flutter.framework": "flutter",
              "hermesvm.framework": "react-native", "hermes.framework": "react-native"}
ASSET_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".icns", ".car", ".ttf", ".otf", ".woff", ".woff2", ".mp3", ".caf", ".wav", ".mp4", ".lproj", ".nib", ".strings", ".fd", ".bin", ".rom", ".lid")

so_rules = {}
for r in json.load(io.open(RULES, encoding="utf-8"))["rules"]:
    for m in r["match"]:
        so_rules[m["value"]] = (r["id"], r["name"])

def kids(n):
    return {c["n"]: c for c in n.get("c", [])}

def get(n, parts):
    for p in parts:
        n = kids(n).get(p)
        if n is None:
            return None
    return n

def total(n):
    return n["b"] if n else 0

def comp(target, value, origin, layer, b, status, basis, note=None, **extra):
    d = {"match": {"target": target, "value": value}, "layer": layer, "origin": origin, "bytes": b, "status": status, "basis": basis}
    if note:
        d["note"] = note
    d.update(extra)
    return d

def asar_components(asar, prefix, out):
    k = kids(asar)
    nm = k.get("node_modules")
    pk = sorted(kids(nm).values(), key=lambda c: -c["b"]) if nm else []
    for c in pk[:8]:
        out.append(comp("npm-package", c["n"], "library", "library", c["b"], "clear", "asar 안의 node_modules/" + c["n"]))
    own = sum(c["b"] for name, c in k.items() if name not in ("node_modules", "(overhead)"))
    if own:
        out.append(comp("path", prefix + "app.asar (node_modules 밖)", "bundled-app-code", "library", own, "judgment",
                        "asar 안에서 node_modules 밖에 있는 파일의 합", "번들러가 합친 JS에는 외부 코드가 섞여 있을 수 있다. 소스맵과 에셋도 이 합에 들어 있다"))
    return {"packagesInAsar": len(pk), "nodeModulesBytes": total(nm), "asarOverheadBytes": total(k.get("(overhead)"))}

def apple(root, s, out, ios):
    """macOS 앱과 iOS 앱. root 는 .app 노드."""
    facts = {}
    base = [] if ios else ["Contents"]
    fw = get(root, base + ["Frameworks"])
    exe_dir = root if ios else get(root, ["Contents", "MacOS"])
    res = root if ios else get(root, ["Contents", "Resources"])
    pfx = "" if ios else "Contents/"
    other_fw = {"shown": 0, "count": 0, "bytes": 0}
    for name, c in sorted(kids(fw).items(), key=lambda x: -x[1]["b"]) if fw else []:
        p = pfx + "Frameworks/" + name
        if name in RUNTIME_FW:
            out.append(comp("path", p, "runtime", "library", c["b"], "clear", "런타임 엔진 프레임워크"))
        elif name.endswith(".app"):
            if "Helper" in name and s["runtime"] == "electron":
                out.append(comp("path", p, "runtime", "container", c["b"], "clear", "Electron Helper 앱. 해부기가 소유를 선언한다", containerType="nested-app"))
            else:
                out.append(comp("path", p, "library", "container", c["b"], "judgment", "중첩 앱", containerType="nested-app"))
        elif name == "App.framework":
            a = kids(c)
            snap = get(c, ["Versions", "A", "App"]) or a.get("App")
            assets = get(c, ["Versions", "A", "Resources", "flutter_assets"]) or a.get("flutter_assets")
            if snap:
                out.append(comp("path", p + " (App 스냅샷)", "bundled-app-code", "library", snap["b"], "clear", "Flutter 앱 스냅샷. 안쪽을 보지 않는다"))
            if assets:
                out.append(comp("path", p + " (flutter_assets)", "asset", "library", assets["b"], "clear", "Flutter 에셋 묶음(확정: 묶음 전체가 에셋)", "안의 파일은 모듈 층에서 파일 종류로 구별한다"))
        else:
            if other_fw["shown"] >= 8 and c["b"] < root["b"] * 0.005:
                other_fw["count"] += 1; other_fw["bytes"] += c["b"]
                continue
            other_fw["shown"] += 1
            out.append(comp("framework-name" if name.endswith(".framework") else "path", name[:-10] if name.endswith(".framework") else p, "library", "library", c["b"], "judgment",
                            "프레임워크 이름이 드러난 단위(일반 구조 규칙)"))
    if other_fw["count"]:
        facts["otherFrameworks"] = {"count": other_fw["count"], "bytes": other_fw["bytes"], "origin": "library"}
    # 주 실행 파일
    exe_name = s.get("exe") or s["app"].replace(" Desktop", "").replace(" Mobile", "")
    exe = kids(exe_dir).get(exe_name) if exe_dir else None
    if exe is None and exe_dir is not None and not ios:
        exe_name, exe = max(kids(exe_dir).items(), key=lambda x: x[1]["b"])
    if exe:
        out.append(comp("path", pfx + ("" if ios else "MacOS/") + exe_name, "runtime" if s["runtime"] == "electron" else "bundled-app-code", "library", exe["b"],
                        "judgment" if s["runtime"] != "electron" else "clear",
                        "Electron의 시동 코드(확정: 런타임)" if s["runtime"] == "electron" else "주 실행 파일", None if s["runtime"] == "electron" else "정적으로 링크된 실행 파일은 안쪽을 보지 않는다"))
        facts["mainExecutableBytes"] = exe["b"]
    if res:
        rk = kids(res)
        for name in ("app.asar",):
            if name in rk:
                facts.update(asar_components(rk[name], pfx + "Resources/", out))
        un = rk.get("app.asar.unpacked")
        if un:
            unm = get(un, ["node_modules"])
            flat = []
            for c in kids(unm).values() if unm else []:
                if c["n"].startswith("@"):
                    flat += [dict(g, n=c["n"] + "/" + g["n"]) for g in kids(c).values()]
                else:
                    flat.append(c)
            for c in sorted(flat, key=lambda c: -c["b"])[:4]:
                out.append(comp("npm-package", c["n"] + " (unpacked)", "library", "library", c["b"], "clear", "app.asar.unpacked/node_modules/" + c["n"],
                                "확정된 표(app-anatomy-dissectors.md)에 따라 asar 안의 같은 패키지 노드에 합친다"))
            facts["asarUnpackedBytes"] = un["b"]
        skip = {"app.asar", "app.asar.unpacked", "Frameworks", "PlugIns", exe_name, "_CodeSignature", "Info.plist", "PkgInfo"}
        loose = 0
        for name, c in sorted(rk.items(), key=lambda x: -x[1]["b"]):
            if name in skip:
                continue
            if name == "build" and "tesseract.js-core" in kids(c):
                t = kids(c)["tesseract.js-core"]
                out.append(comp("path", pfx + "Resources/build/tesseract.js-core/", "library", "library", t["b"], "clear", "손으로 쓴 내장 규칙 lib.tesseract-js-core", ruleSource="builtin", ruleId="lib.tesseract-js-core"))
                out.append(comp("path", pfx + "Resources/build (tesseract.js-core 밖)", "unidentified", "library", c["b"] - t["b"], "clear", "규칙에 없다(확정: 미식별이 정답)", "기본 플러그인, pdf.worker, 7zip 등"))
                continue
            if c["b"] >= max(root["b"] * 0.01, 300_000):
                is_asset = name.lower().endswith(ASSET_EXT) or name == "Assets.car"
                bundle = name.endswith("jsbundle")
                out.append(comp("path", pfx + ("" if ios else "Resources/") + name,
                                "bundled-app-code" if bundle else ("asset" if is_asset else "unidentified"), "library", c["b"],
                                "clear",
                                "React Native JS 번들" if bundle else ("에셋(확장자와 경로)" if is_asset else "규칙에 없다(확정: 미식별이 정답)"),
                                "펌웨어 이미지 묶음이다. 확장자가 에셋 목록에 없고 규칙도 없어서 도구가 낼 값은 미식별이다" if name == "qemu" else None))
            else:
                loose += c["b"]
        facts["smallResourceBytes"] = loose
    plug = get(root, base + ["PlugIns"])
    for name, c in sorted(kids(plug).items(), key=lambda x: -x[1]["b"]) if plug else []:
        if c["b"] > 100_000:
            inner = kids(c)
            exe_n = name.rsplit(".", 1)[0]
            ex = inner.get(exe_n) or get(c, ["Contents", "MacOS", exe_n])
            if ex:
                out.append(comp("path", pfx + "PlugIns/" + name + "/" + exe_n, "bundled-app-code", "library", ex["b"], "clear", "앱 확장의 실행 파일(확정: 묶음에는 출처를 적지 않고 안쪽만 적는다)"))
            facts.setdefault("appExtensions", []).append({"name": name, "bytes": c["b"], "executableBytes": total(ex), "containerType": "nested-app"})
    sig = get(root, base + ["_CodeSignature"])
    facts["codeSignatureBytes"] = total(sig)
    return facts

def apk(root, s, out):
    facts = {}
    k = kids(root)
    lib = k.get("lib")
    abis = kids(lib) if lib else {}
    by_name = {}
    for abi, an in abis.items():
        for name, c in kids(an).items():
            e = by_name.setdefault(name, {"bytes": 0, "abis": 0})
            e["bytes"] += c["b"]; e["abis"] += 1
    facts["abis"] = sorted(abis)
    facts["copies"] = [{"containerType": "abi", "name": a, "bytes": abis[a]["b"]} for a in sorted(abis)] if len(abis) > 1 else []
    facts["nativeLibBytes"] = total(lib)
    shown = 0
    for name, e in sorted(by_name.items(), key=lambda x: -x[1]["bytes"]):
        if shown >= 10 and e["bytes"] < root["b"] * 0.01:
            continue
        shown += 1
        extra = {"abiCount": e["abis"]}
        if name in RUNTIME_SO:
            out.append(comp("file-name", name, "runtime", "library", e["bytes"], "clear", "런타임 엔진 라이브러리", **extra))
        elif name == "libapp.so":
            out.append(comp("file-name", name, "bundled-app-code", "library", e["bytes"], "clear", "Flutter 앱 스냅샷. 안쪽을 보지 않는다", **extra))
        elif name in so_rules:
            out.append(comp("file-name", name, "library", "library", e["bytes"], "clear", "LibChecker 규칙 %s (%s)" % so_rules[name], ruleSource="libchecker-rules", ruleId=so_rules[name][0], **extra))
        else:
            own = "rust_lib_" in name or s["app"].lower().split()[0] in name.lower()
            out.append(comp("file-name", name, "unidentified", "library", e["bytes"], "clear", "규칙에 없다(확정: 미식별이 정답)",
                            "앱이 직접 빌드한 네이티브 코드로 보인다. 도구는 이름만으로 그렇게 단정하지 않는다" if own else "규칙을 쓰면 외부 라이브러리로 바뀐다", **extra))
    dex = k.get("dex")
    if dex:
        dk = kids(dex)
        app_prefix = "/".join(s["app_id"].split(".")[:2])
        facts["dexBytes"] = dex["b"]; facts["dexSharedBytes"] = total(dk.get("(shared)")); facts["appPackagePrefix"] = app_prefix
        pk = sorted((c for n, c in dk.items() if n not in ("(shared)", "(default)")), key=lambda c: -c["b"])
        if "(default)" in dk:
            out.append(comp("dex-class", "(패키지 마디가 둘 미만인 클래스)", "unidentified", "library", dk["(default)"]["b"], "clear",
                            "이름이 줄여진(난독화된) 클래스(확정: 미식별이 정답)", "도구가 여기에 라이브러리 이름을 붙이면 오탐으로 센다"))
        short = sum(c["b"] for c in pk if all(len(p) <= 2 for p in c["n"].split("/")))
        facts["dexShortNamePackageBytes"] = short
        listed = 0
        for c in pk:
            is_app = c["n"] == app_prefix
            if not is_app and listed >= 8:
                continue
            if all(len(p) <= 2 for p in c["n"].split("/")) and not is_app:
                continue
            listed += 0 if is_app else 1
            known = c["n"].split("/")[0] in ("androidx", "kotlin", "kotlinx") or c["n"] in ("com/google", "com/facebook", "com/swmansion", "org/webrtc", "okhttp3/internal", "okhttp3", "io/flutter", "expo/modules", "org/spongycastle", "com/bumptech", "io/reactivex", "org/jsoup", "org/mozilla", "org/maplibre", "org/chromium", "com/bugsnag", "com/horcrux")
            rt_java = c["n"] == "io/flutter" or (c["n"] == "com/facebook" and s["runtime"] == "react-native")
            out.append(comp("dex-class", c["n"] + "/", "app-code" if is_app else ("runtime" if rt_java else ("library" if known else "unidentified")), "library", c["b"],
                            "clear" if is_app or c["n"] == "io/flutter" or not known else "judgment",
                            "매니페스트의 패키지 이름 " + s["app_id"] if is_app else ("런타임의 자바 쪽 코드(확정: 런타임)" if rt_java else ("널리 알려진 패키지 접두어" if known else "규칙에 없다(확정: 미식별이 정답)")),
                            "com/facebook 아래에는 React Native가 아닌 라이브러리도 섞여 있다. 더 긴 접두어(com/facebook/react/ 등)로 좁혀 바이트를 다시 나눠야 한다" if c["n"] == "com/facebook" and rt_java else None))
        if app_prefix not in dk:
            facts["appPackageMissingInDex"] = True
    assets = k.get("assets")
    for name, c in sorted(kids(assets).items(), key=lambda x: -x[1]["b"]) if assets else []:
        if name == "flutter_assets":
            out.append(comp("path", "assets/flutter_assets", "asset", "library", c["b"], "clear", "Flutter 에셋 묶음(확정: 묶음 전체가 에셋)"))
        elif name == "index.android.bundle":
            out.append(comp("path", "assets/index.android.bundle", "bundled-app-code", "library", c["b"], "clear", "React Native JS 번들(Hermes 바이트코드)"))
        elif c["b"] >= root["b"] * 0.01:
            out.append(comp("path", "assets/" + name, "asset", "library", c["b"], "judgment", "assets/ 아래(계획 9.1: 경로로 에셋 판정)",
                            "안에 JS 파일이 들어 있다. 경로 규칙대로면 에셋이지만 사실과는 다르다" if name == "dist" else None))
    for name, why in (("res", "Android 리소스"), ("resources.arsc", "Android 리소스 표")):
        if name in k:
            out.append(comp("path", name, "asset", "library", k[name]["b"], "clear", why))
    return facts

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for s in SAMPLES:
        tree = json.load(io.open(os.path.join(TREES, s["id"] + ".tree.json"), encoding="utf-8"))
        meta = json.load(io.open(os.path.join(TREES, s["id"] + ".meta.json"), encoding="utf-8"))
        out = []
        if s["packaging"] == "apk":
            root = tree
            facts = apk(tree, s, out)
        else:
            root = get(tree, ["Payload"]) or tree
            root = next(c for c in root["c"] if c["n"].endswith(".app"))
            facts = apple(root, s, out, ios=s["packaging"] == "ipa")
            facts["hasPayloadFolder"] = bool(get(tree, ["Payload"])) if s["packaging"] == "ipa" else None
        out.sort(key=lambda c: -c["bytes"])
        listed = sum(c["bytes"] for c in out)
        review = [c for c in out if c["status"] == "needs-review"]
        doc = {
            "answerFormat": 1,
            "status": "draft",
            "sample": {
                "id": s["id"], "app": s["app"], "version": s["version"], "packaging": s["packaging"],
                "file": meta["file"], "fileBytes": meta["bytes"], "sha256": meta["sha256"],
                "source": "https://github.com/" + s["repo"] + "/releases", "license": s["license"],
            },
            "expected": {
                "entryBytes": tree["b"],
                "runtimes": [{"runtime": s["runtime"], "dissected": s["runtime"] in ("electron", "flutter", "react-native", "native")}],
                "components": out,
                "listedBytes": listed,
                "listedShare": round(listed / tree["b"], 4),
                "facts": {k: v for k, v in facts.items() if v is not None},
            },
            "surprisingFact": s["fact"],
        }
        if s["id"] == "10-newpipe":
            doc["expected"]["runtimes"][0]["note"] = "확정된 결정(Android에서도 Compose를 감지)에 따라 native가 아니라 compose로 나온다. Jetpack Compose와 구별되지 않는다. 확신도는 낮음"
        with io.open(os.path.join(OUT, s["id"] + ".json"), "w", encoding="utf-8") as f:
            f.write(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
        rows.append((s, doc, review))
    summary = []
    for s, doc, review in rows:
        e = doc["expected"]
        summary.append("%s | %s | %d | %.0f%% | %d" % (s["id"], s["runtime"], len(e["components"]), 100 * e["listedShare"], len(review)))
    print("\n".join(summary))

if __name__ == "__main__":
    main()
