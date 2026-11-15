#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""정답 파일의 일관성 검사. 사용법: python3 check-answers.py <정답 폴더>"""
import glob, io, json, os, re, sys
ORIGINS = {"app-code", "bundled-app-code", "library", "runtime", "asset", "unidentified"}
STATUS = {"clear", "judgment", "needs-review"}
bad = 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.json"))):
    d = json.load(io.open(f, encoding="utf-8")); e = d["expected"]; errs = []
    if not re.fullmatch(r"[0-9a-f]{64}", d["sample"]["sha256"]): errs.append("sha256 형식")
    seen = set()
    for c in e["components"]:
        key = (c["match"]["target"], c["match"]["value"])
        if key in seen: errs.append("겹치는 항목 %s" % (key,))
        seen.add(key)
        if c["origin"] not in ORIGINS: errs.append("모르는 출처 " + c["origin"])
        if c["status"] not in STATUS: errs.append("모르는 상태 " + c["status"])
        if c["bytes"] <= 0: errs.append("0바이트 항목 %s" % (key,))
    s = sum(c["bytes"] for c in e["components"])
    if s != e["listedBytes"]: errs.append("listedBytes 불일치")
    if s > e["entryBytes"]: errs.append("항목 합이 전체보다 크다 (%d > %d)" % (s, e["entryBytes"]))
    if not e["runtimes"]: errs.append("런타임 없음")
    print("%s: %s" % (os.path.basename(f), "통과" if not errs else "; ".join(errs)))
    bad += bool(errs)
sys.exit(1 if bad else 0)
