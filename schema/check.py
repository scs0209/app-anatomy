#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""결과 JSON 검사. (1) result.schema.json 으로 형식을 검증하고 (2) 스키마로 표현하지 못하는 규칙을 검사한다.
사용법: python3 check.py 결과.json [...]   (jsonschema 패키지가 없으면 (1)을 건너뛰고 그렇게 알린다)"""
import json, sys, os, re, io

HERE = os.path.dirname(os.path.abspath(__file__))
NO_ORIGIN = {"container", "overhead", "shared", "link", "parse-failed"}

def walk(node, path=()):
    p = path + (node["name"],)
    yield node, p
    for c in node.get("children", []):
        yield from walk(c, p)

def check(doc):
    errs = []
    def e(path, msg):
        errs.append("/".join(path) + ": " + msg)
    root = doc["root"]
    if root["kind"] != "app":
        e((root["name"],), "뿌리의 kind 가 app 이 아니다")
    tot = {"unidentified": 0, "opaque": 0, "overhead": 0, "shared": 0, "failed": 0}
    copies = {}
    for node, p in walk(root):
        kids = node.get("children", [])
        k = node["kind"]
        if node["bytes"] >= 2 ** 53:
            e(p, "bytes 가 2^53 이상이다")
        if kids:
            s = sum(c["bytes"] for c in kids)
            if s != node["bytes"]:
                e(p, "bytes %d 가 자식 합 %d 와 다르다" % (node["bytes"], s))
            names = [c["name"].encode("utf-8") for c in kids]
            if names != sorted(names):
                e(p, "자식이 이름의 UTF-8 바이트 순서로 정렬돼 있지 않다")
            if len(set(names)) != len(names):
                e(p, "형제 이름이 겹친다")
            if "fileKind" in node:
                e(p, "자식이 있는 노드에 fileKind 가 있다")
        else:
            if node.get("origin") == "unidentified": tot["unidentified"] += node["bytes"]
            if node.get("origin") == "bundled-app-code": tot["opaque"] += node["bytes"]
        if k in NO_ORIGIN and "origin" in node:
            e(p, "%s 노드에 origin 이 있다" % k)
        if k not in NO_ORIGIN and "origin" not in node and k != "app" and k != "runtime":
            e(p, "%s 노드에 origin 이 없다" % k)
        if ("confidence" in node) and ("origin" not in node):
            e(p, "origin 없이 confidence 가 있다")
        if (k == "container") != ("containerType" in node):
            e(p, "containerType 은 container 노드에만, 그리고 반드시 있어야 한다")
        if (k == "link") != ("link" in node):
            e(p, "link 필드는 link 노드에만, 그리고 반드시 있어야 한다")
        if k == "link" and (node["bytes"] != 0 or kids):
            e(p, "link 노드는 0바이트 잎이어야 한다")
        if (k == "parse-failed") != ("failure" in node):
            e(p, "failure 는 parse-failed 노드에만, 그리고 반드시 있어야 한다")
        if k in ("overhead", "shared", "parse-failed") and kids:
            e(p, "%s 노드에 자식이 있다" % k)
        if ("ruleSource" in node) != ("ruleId" in node):
            e(p, "ruleId 와 ruleSource 는 함께 있어야 한다")
        if "shortNameRatio" in node and node.get("containerType") != "parsed-file":
            e(p, "shortNameRatio 는 parsed-file 묶음에만 둔다")
        if node.get("containerType") == "opaque" and kids:
            e(p, "opaque 묶음에는 자식이 없어야 한다")
        r = node.get("shortNameRatio")
        if r is not None and not (0 <= r <= 1):
            e(p, "shortNameRatio 가 0~1 밖이다")
        if k == "overhead": tot["overhead"] += node["bytes"]
        if k == "shared": tot["shared"] += node["bytes"]
        if k == "parse-failed": tot["failed"] += 1
        if k == "container" and node.get("containerType") in ("abi", "arch"):
            key = (node["containerType"], node["name"])
            copies[key] = copies.get(key, 0) + node["bytes"]
    c = doc["completeness"]
    top = ("(top)",)
    for field, want in (("totalBytes", root["bytes"]), ("unidentifiedBytes", tot["unidentified"]), ("opaqueBytes", tot["opaque"]),
                        ("overheadBytes", tot["overhead"]), ("sharedBytes", tot["shared"]), ("parseFailedNodes", tot["failed"])):
        if c[field] != want:
            e(top, "completeness.%s 가 %d 인데 트리에서 센 값은 %d 이다" % (field, c[field], want))
    want_copies = sorted(copies.items()) if len(copies) >= 2 else []
    got = [((x["containerType"], x["name"]), x["bytes"]) for x in doc["copies"]]
    if got != want_copies:
        e(top, "copies 가 트리의 abi/arch 묶음과 다르다")
    rb = [r["bytes"] for r in doc["runtimes"]]
    if rb != sorted(rb, reverse=True):
        e(top, "runtimes 가 바이트 큰 순서가 아니다")
    if not doc["runtimes"]:
        e(top, "runtimes 가 비어 있다 (감지된 것이 없으면 native 하나)")
    h = doc["inputSha256"]
    if h is not None and not re.fullmatch(r"[0-9a-f]{64}", h):
        e(top, "inputSha256 형식이 틀리다")
    if doc["schemaVersion"] != 1:
        e(top, "schemaVersion 이 1 이 아니다")
    return errs

def main(paths):
    schema = json.load(io.open(os.path.join(HERE, "result.schema.json"), encoding="utf-8"))
    try:
        import jsonschema
        validator = jsonschema.Draft7Validator(schema)
    except ImportError:
        validator = None
        print("주의: jsonschema 패키지가 없어 형식 검증을 건너뛴다")
    bad = 0
    for p in paths:
        doc = json.load(io.open(p, encoding="utf-8"))
        errs = []
        if validator:
            errs += ["형식: /%s: %s" % ("/".join(str(x) for x in er.absolute_path), er.message[:160]) for er in validator.iter_errors(doc)]
        if not errs:
            errs += check(doc)
        print("%s: %s" % (os.path.basename(p), "통과" if not errs else "%d건" % len(errs)))
        for x in errs[:20]:
            print("   " + x)
        bad += bool(errs)
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
