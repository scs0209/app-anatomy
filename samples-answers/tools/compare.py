#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""코어의 결과를 정답 초안과 대조한다. 사용법: python3 compare.py <정답 폴더> <결과 폴더>
결과 파일 이름은 <표본 id>.json. 이름으로 노드를 찾아 출처와 바이트를 비교한다."""
import glob, io, json, os, sys
ANS, OUT = sys.argv[1:3]

def walk(n, parents=()):
    yield n, parents
    for c in n.get("children", []):
        yield from walk(c, parents + (n,))

def find(doc, target, value):
    """정답의 match 에 해당하는 결과 노드들."""
    v = value.replace(" (unpacked)", "")
    nodes = [(n, ps) for n, ps in walk(doc["root"]) if n["kind"] in ("library", "container")]
    def named(name, pred=lambda n, ps: True):
        return [n for n, ps in nodes if n["name"] == name and pred(n, ps)]
    if target == "file-name":
        return named(v)
    if target == "npm-package":
        return named(v, lambda n, ps: any(p.get("containerType") == "parsed-file" for p in ps))
    if target == "framework-name":
        return named(v)
    if target == "dex-class":
        key = v.rstrip("/")
        hit = named(key, lambda n, ps: any(p["name"] == "dex" for p in ps))
        if not hit:  # 긴 앱 패키지 이름(org/schabi → org/schabi/newpipe)이나 더 긴 런타임 접두어
            hit = [n for n, ps in nodes if n["name"].startswith(key + "/") and any(p["name"] == "dex" for p in ps)]
        if hit:
            return hit
        # 규칙에 맞아 더 넓은 접두어로 묶인 경우(예: 정답 androidx/datastore/, 결과 AndroidX = androidx/ 전체).
        # 바이트는 비교할 수 없으므로 출처만 본다.
        wide = [n for n, ps in nodes if any(p["name"] == "dex" for p in ps) and (n.get("evidence") or {}).get("kind") == "prefix" and v.startswith((n.get("evidence") or {}).get("detail", "\0"))]
        if wide:
            return [dict(w, bytes=None) for w in wide]
    by_evidence = [n for n, ps in nodes if (n.get("evidence") or {}).get("detail") == v]
    if by_evidence:
        return by_evidence
    ALIAS = {"(node_modules 밖)": "(app)", "(App 스냅샷)": "App (snapshot)", "(flutter_assets)": "flutter_assets", "(패키지 마디가": "(short or top-level names)", "(tesseract.js-core 밖)": "build"}
    for k, name in ALIAS.items():
        if k in v:
            return named(name)
    if target == "path" and "/MacOS/" in v:
        exe = v.split("/")[-1]
        return named(exe) or named(exe + " (launcher)")
    if target == "path":
        last = v.rstrip("/").split("/")[-1]
        for cand in (last, last.replace(".framework", ""), "res" if v == "res" else None, v):
            if cand:
                h = named(cand)
                if h:
                    return h
    return []

tot = {"same": 0, "origin": 0, "bytes": 0, "missing": 0}
for f in sorted(glob.glob(os.path.join(ANS, "*.json"))):
    a = json.load(io.open(f, encoding="utf-8")); sid = a["sample"]["id"]
    rp = os.path.join(OUT, sid + ".json")
    if not os.path.exists(rp):
        print(sid, "결과 없음"); continue
    d = json.load(io.open(rp, encoding="utf-8"))
    lines = []
    want_rt = [r["runtime"] for r in a["expected"]["runtimes"]]; got_rt = [r["runtime"] for r in d["runtimes"]]
    if want_rt != got_rt:
        lines.append("  런타임: 정답 %s, 결과 %s" % (want_rt, got_rt))
    merged = {}
    for c in a["expected"]["components"]:
        key = (c["match"]["target"], c["match"]["value"].replace(" (unpacked)", ""))
        e = merged.setdefault(key, {"bytes": 0, "origin": c["origin"]})
        e["bytes"] += c["bytes"]
    n = {"same": 0, "origin": 0, "bytes": 0, "missing": 0}
    for (target, value), e in merged.items():
        hits = find(d, target, value)
        if not hits:
            n["missing"] += 1; lines.append("  못 찾음: %s:%s (%.1f MB)" % (target, value[:50], e["bytes"] / 1e6)); continue
        coarse = any(h["bytes"] is None for h in hits)
        got_b = e["bytes"] if coarse else sum(h["bytes"] for h in hits)
        origins = {h.get("origin") for h in hits} - {None}
        ok_o = e["origin"] in origins or not origins
        ok_b = abs(got_b - e["bytes"]) <= max(0.01 * e["bytes"], 4096)
        if ok_o and ok_b and coarse: n["same"] += 1; n["coarse"] = n.get("coarse", 0) + 1
        elif ok_o and ok_b: n["same"] += 1
        else:
            if not ok_o: n["origin"] += 1; lines.append("  출처: %s:%s 정답 %s, 결과 %s" % (target, value[:40], e["origin"], sorted(origins)))
            if not ok_b: n["bytes"] += 1; lines.append("  바이트: %s:%s 정답 %.2f MB, 결과 %.2f MB" % (target, value[:40], e["bytes"] / 1e6, got_b / 1e6))
    for k in ("same", "origin", "bytes", "missing", "coarse"): tot[k] = tot.get(k, 0) + n.get(k, 0)
    print("%s: 같음 %d (그중 출처만 비교 %d), 출처 다름 %d, 바이트 다름 %d, 못 찾음 %d" % (sid, n["same"], n.get("coarse", 0), n["origin"], n["bytes"], n["missing"]))
    for l in lines[:12]: print(l)
    if len(lines) > 12: print("  … %d건 더" % (len(lines) - 12))
print("합계:", tot)
