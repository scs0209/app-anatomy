#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LibChecker-Rules(Apache-2.0)의 네이티브 라이브러리 규칙을 이 프로젝트의 규칙 파일 형식으로 바꾼다.

사용법: python3 convert-libchecker.py <LibChecker-Rules 저장소 폴더> <커밋 해시> <출력 파일>

가져오는 것: 이름, 만든 곳, 출처 링크(https만), 파일 이름의 정확 일치 조건.
가져오지 않는 것: 설명 문구, 아이콘, 기여자 이름, 정규식 조건, 네이티브 라이브러리가 아닌 조건.
한 번 돌려 결과를 커밋한다. 다시 가져올 때는 원본에 NOTICE 파일이 생겼는지 먼저 본다."""
import glob, io, json, os, re, sys

def main(root, revision, out):
    stats = {"libraries": 0, "kept_rules": 0, "kept_matches": 0, "dropped_regex": 0, "dropped_other_type": 0,
             "libraries_without_native_exact": 0, "homepage_dropped_not_https": 0, "name_from_matcher_label": 0, "notice_file_present": False}
    stats["notice_file_present"] = any(os.path.exists(os.path.join(root, n)) for n in ("NOTICE", "NOTICE.txt", "NOTICE.md"))
    rules, used = [], set()
    for f in sorted(glob.glob(os.path.join(root, "libraries", "*.json"))):
        d = json.load(io.open(f, encoding="utf-8"))
        stats["libraries"] += 1
        keep = []
        for m in d.get("matchers", []):
            if m.get("mode") != "exact":
                stats["dropped_regex"] += 1
            elif m.get("type") != 0:
                stats["dropped_other_type"] += 1
            else:
                keep.append(m)
        if not keep:
            stats["libraries_without_native_exact"] += 1
            continue
        names = sorted({m["name"] for m in keep}, key=lambda s: s.encode("utf-8"))
        en = next((x["data"] for x in d.get("data", []) if x.get("locale") == "en"), None)
        name = (en or {}).get("label") or ""
        if not name.strip():
            name = keep[0].get("label") or names[0]
            stats["name_from_matcher_label"] += 1
        # 식별자는 원본의 UUID에서 만든다. 원본이 이름을 바꿔도 식별자가 그대로다.
        uuid = str(d.get("uuid") or "").lower()
        if not re.fullmatch(r"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", uuid):
            raise SystemExit("UUID 형식이 아니다: %r (%s)" % (uuid, os.path.basename(f)))
        rid = "lc." + uuid
        if rid in used:
            raise SystemExit("UUID가 겹친다: " + uuid)
        used.add(rid)
        rule = {"id": rid, "name": name.strip(), "kind": "library", "category": "other"}
        vendor = ((en or {}).get("dev_team") or "").strip()
        if vendor:
            rule["vendor"] = vendor
        link = ((en or {}).get("source_link") or "").strip()
        if link.startswith("https://"):
            rule["homepage"] = link
        elif link:
            stats["homepage_dropped_not_https"] += 1
        rule["match"] = [{"target": "file-name", "type": "literal", "value": n, "packaging": ["apk"]} for n in names]
        stats["kept_rules"] += 1
        stats["kept_matches"] += len(names)
        rules.append(rule)
    rules.sort(key=lambda r: r["id"].encode("utf-8"))
    doc = {
        "formatVersion": 1,
        "source": {
            "id": "libchecker-rules",
            "name": "LibChecker-Rules",
            "license": "Apache-2.0",
            "url": "https://github.com/LibChecker/LibChecker-Rules",
            "revision": revision,
            "modified": True,
            "notice": "Copyright 2022 Absinthe. Licensed under the Apache License, Version 2.0. Converted to the App Anatomy rule format: only names, vendors, links and exact native-library file names were kept; descriptions, icons, contributor names, regex matchers and non-native matchers were dropped.",
        },
        "rules": rules,
    }
    io.open(out, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(stats, ensure_ascii=False))

if __name__ == "__main__":
    main(*sys.argv[1:4])
