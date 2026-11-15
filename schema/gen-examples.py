#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""예시 결과 JSON 두 개를 만든다. 숫자는 설명용으로 지어낸 값이다(실제 앱의 측정값이 아니다).
부모 바이트와 완전성 요약은 여기서 계산해 넣으므로 불변식이 항상 맞는다."""
import json, io

def n(kind, name, bytes_=None, children=None, **kw):
    d = {"kind": kind, "name": name}
    d.update(kw)
    if children:
        d["children"] = sorted(children, key=lambda c: c["name"].encode("utf-8"))
        d["bytes"] = sum(c["bytes"] for c in d["children"])
    else:
        d["bytes"] = bytes_
    return d

def ev(kind, detail):
    return {"kind": kind, "detail": detail}

def leaves(node):
    if node.get("children"):
        for c in node["children"]:
            yield from leaves(c)
    else:
        yield node

def walk(node):
    yield node
    for c in node.get("children", []):
        yield from walk(c)

def finish(root, **top):
    comp = {
        "totalBytes": root["bytes"],
        "unidentifiedBytes": sum(l["bytes"] for l in leaves(root) if l.get("origin") == "unidentified"),
        "opaqueBytes": sum(l["bytes"] for l in leaves(root) if l.get("origin") == "bundled-app-code"),
        "overheadBytes": sum(x["bytes"] for x in walk(root) if x["kind"] == "overhead"),
        "sharedBytes": sum(x["bytes"] for x in walk(root) if x["kind"] == "shared"),
        "parseFailedNodes": sum(1 for x in walk(root) if x["kind"] == "parse-failed"),
    }
    copies = {}
    for x in walk(root):
        if x["kind"] == "container" and x.get("containerType") in ("abi", "arch"):
            k = (x["containerType"], x["name"])
            copies[k] = copies.get(k, 0) + x["bytes"]
    copies = [{"containerType": t, "name": nm, "bytes": b} for (t, nm), b in sorted(copies.items())]
    if len(copies) < 2:
        copies = []
    out = {"schemaVersion": 1, "toolVersion": "0.0.0-example", "rulesVersion": "0-example"}
    out.update(top)
    out["completeness"] = comp
    out["copies"] = copies
    out.setdefault("warnings", [])
    out["root"] = root
    order = ["schemaVersion", "toolVersion", "rulesVersion", "inputSha256", "input", "runtimes", "completeness", "copies", "warnings", "root"]
    return {k: out[k] for k in order}

LIB = dict(origin="library", confidence="high")
ASSET = dict(origin="asset", confidence="medium")

# ---- 예시 1: React Native APK, ABI 두 벌, DEX 해석 실패 하나 ----
def abi(name, scale):
    return n("container", name, containerType="abi", children=[
        n("library", "libhermes.so", int(2_100_000 * scale), fileKind="executable", origin="runtime", confidence="high",
          evidence=ev("path", "lib/%s/libhermes.so" % name), paths=["lib/%s/libhermes.so" % name]),
        n("library", "libreactnative.so", int(5_900_000 * scale), fileKind="executable", origin="runtime", confidence="high",
          evidence=ev("path", "lib/%s/libreactnative.so" % name), paths=["lib/%s/libreactnative.so" % name]),
        n("library", "libsqlite3.so", int(1_300_000 * scale), fileKind="executable", category="other", ruleId="lib.sqlite3", ruleSource="libchecker-rules",
          evidence=ev("path", "libsqlite3.so"), paths=["lib/%s/libsqlite3.so" % name], **LIB),
    ])

rn = n("runtime", "React Native", children=[
    abi("arm64-v8a", 1.0), abi("x86_64", 1.07),
    n("library", "index.android.bundle", 14_700_000, fileKind="script", origin="bundled-app-code", confidence="high",
      evidence=ev("location", "assets/index.android.bundle"), paths=["assets/index.android.bundle"], noModuleLayer=True, compressedBytes=5_100_000),
])
dex = n("container", "dex", containerType="parsed-file", shortNameRatio=0.0, paths=["classes.dex", "classes2.dex"], children=[
    n("library", "com/example", origin="app-code", confidence="high", evidence=ev("metadata", "AndroidManifest package com.example.notes"), children=[
        n("module", "notes/MainActivity", 4_212, fileKind="executable", origin="app-code", confidence="high"),
        n("module", "notes/SyncService", 9_870, fileKind="executable", origin="app-code", confidence="high"),
    ]),
    n("library", "com/facebook", category="other", ruleId="dex.facebook", ruleSource="builtin", evidence=ev("prefix", "com/facebook/"), origin="library", confidence="medium", children=[
        n("module", "react/ReactActivity", 3_120, fileKind="executable", origin="library", confidence="medium"),
        n("module", "react/bridge/CatalystInstanceImpl", 18_444, fileKind="executable", origin="library", confidence="medium"),
    ]),
    n("library", "q8", origin="unidentified", confidence="low", evidence=ev("default", "no rule matched"), children=[
        n("module", "a", 1_024, fileKind="executable", origin="unidentified", confidence="low"),
        n("module", "b", 2_048, fileKind="executable", origin="unidentified", confidence="low"),
    ]),
    n("shared", "(shared)", 3_400_000),
    n("parse-failed", "classes3.dex", 8_600_000, paths=["classes3.dex"], failure={"parser": "dex", "code": "E_CORRUPT_INPUT", "offset": 112}),
])
apk_root = n("app", "Example Notes", children=[
    rn, dex,
    n("library", "res", 4_400_000, fileKind="image", evidence=ev("file-type", "res/"), paths=["res/"], **ASSET),
    n("library", "resources.arsc", 1_900_000, fileKind="localization", evidence=ev("file-type", "resources.arsc"), paths=["resources.arsc"], **ASSET),
    n("library", "assets/fonts", 620_000, fileKind="font", evidence=ev("file-type", "assets/fonts/"), paths=["assets/fonts/"], **ASSET),
    n("overhead", "(overhead)", 310_000),
])
apk = finish(apk_root,
    inputSha256="0" * 64,
    input={"packaging": "apk", "name": "Example Notes", "appId": "com.example.notes", "appVersion": "1.2.3", "approximate": False},
    runtimes=[{"runtime": "react-native", "dissected": True, "bytes": rn["bytes"], "confidence": "high", "evidence": ev("path", "lib/arm64-v8a/libreactnative.so")}],
    warnings=[{"code": "W_PARSE_FAILED", "message": "classes3.dex could not be parsed; it is counted as one block.", "path": "classes3.dex"}])

# ---- 예시 2: Electron macOS 앱, 유니버설 실행 파일, 링크, 해시는 계산 중 ----
def pkg(name, files, **kw):
    return n("library", name, children=[n("module", f, b, fileKind=k, **LIB) for f, b, k in files],
             evidence=ev("metadata", "node_modules/%s/package.json" % name), **dict(LIB, **kw))

asar = n("container", "app.asar", containerType="parsed-file", paths=["Contents/Resources/app.asar", "Contents/Resources/app.asar.unpacked/"], children=[
    pkg("@scope/widgets", [("dist/index.js", 210_000, "script"), ("dist/index.js.map", 640_000, "sourcemap")], category="ui", ruleId="npm.scope-widgets", ruleSource="builtin"),
    pkg("left-pad", [("index.js", 1_200, "script"), ("package.json", 480, "data")]),
    pkg("sqlite3", [("build/Release/node_sqlite3.node", 4_100_000, "executable"), ("lib/sqlite3.js", 22_000, "script")]),
    n("library", "main.bundle.js", 13_100_000, fileKind="script", origin="bundled-app-code", confidence="high", evidence=ev("location", "outside node_modules"), noModuleLayer=True),
    n("overhead", "(overhead)", 412_000),
])
electron = n("runtime", "Electron", children=[
    n("library", "Electron Framework", 191_800_000, fileKind="executable", origin="runtime", confidence="high",
      evidence=ev("path", "Contents/Frameworks/Electron Framework.framework"), noModuleLayer=True),
    n("container", "Example Helper.app", containerType="nested-app", children=[
        n("library", "Example Helper", 180_000, fileKind="executable", origin="runtime", confidence="high"),
        n("overhead", "(overhead)", 9_000),
    ]),
    asar,
])
main_exe = n("library", "Example", origin="app-code", confidence="medium", evidence=ev("location", "Contents/MacOS/Example"), paths=["Contents/MacOS/Example"], children=[
    n("container", "arm64", containerType="arch", children=[n("module", "code", 52_000, fileKind="executable", origin="bundled-app-code", confidence="medium", noModuleLayer=True)]),
    n("container", "x86_64", containerType="arch", children=[n("module", "code", 55_000, fileKind="executable", origin="bundled-app-code", confidence="medium", noModuleLayer=True)]),
    n("overhead", "(overhead)", 8_192),
])
mac_root = n("app", "Example", children=[
    electron, main_exe,
    n("library", "Squirrel.framework", 310_000, fileKind="executable", category="other", evidence=ev("path", "Contents/Frameworks/Squirrel.framework"), origin="library", confidence="medium"),
    n("library", "icon.icns", 480_000, fileKind="image", evidence=ev("file-type", ".icns"), **ASSET),
    n("container", "Example Watch.app", 2_400_000, containerType="opaque", paths=["Contents/Watch/Example Watch.app/"]),
    n("link", "Electron Framework.framework/Resources", 0, link={"target": "Versions/Current/Resources", "external": False}),
    n("overhead", "(overhead)", 96_000),
])
mac = finish(mac_root,
    inputSha256=None,
    input={"packaging": "macos-app", "name": "Example", "appId": "com.example.desktop", "approximate": False},
    runtimes=[{"runtime": "electron", "dissected": True, "bytes": electron["bytes"], "confidence": "high",
               "evidence": ev("path", "Contents/Frameworks/Electron Framework.framework"), "version": "42.0.0"}])

for name, data in (("example-apk.json", apk), ("example-electron.json", mac)):
    with io.open(name, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(name, data["root"]["bytes"])
