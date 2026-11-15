#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""result.schema.json 에서 result.d.ts 를 만든다. 외부 도구를 쓰지 않는다.
다루는 형태는 이 스키마에 나오는 것뿐이다: 객체, 문자열 열거, $ref, 배열, 기본 타입, null 허용."""
import json, io, sys

# 항상 쓰이는 필드 가운데 null 일 수 있는 것. 나머지 선택 필드는 값이 없으면 아예 쓰지 않는다.
ALWAYS_PRESENT_NULLABLE = {("AnatomyResult", "inputSha256")}

def doc(text, indent=""):
    if not text:
        return ""
    lines = text.split("\n")
    if len(lines) == 1:
        return "%s/** %s */\n" % (indent, lines[0])
    return "%s/**\n%s\n%s */\n" % (indent, "\n".join("%s * %s" % (indent, l) for l in lines), indent)

def ts_type(s):
    """(타입 문자열, null 허용 여부)"""
    if "$ref" in s:
        return s["$ref"].split("/")[-1], False
    if "allOf" in s and len(s["allOf"]) == 1:
        return ts_type(s["allOf"][0])
    if "anyOf" in s:
        parts = [ts_type(x) for x in s["anyOf"] if x.get("type") != "null"]
        nullable = any(x.get("type") == "null" for x in s["anyOf"])
        return " | ".join(p[0] for p in parts), nullable
    t = s.get("type")
    nullable = False
    if isinstance(t, list):
        nullable = "null" in t
        t = [x for x in t if x != "null"][0]
    if t == "array":
        inner = ts_type(s["items"])[0]
        return ("(%s)[]" % inner if " " in inner else inner + "[]"), nullable
    if t in ("integer", "number"):
        return "number", nullable
    if t in ("string", "boolean"):
        return t, nullable
    raise SystemExit("모르는 형태: %r" % s)

def enum_values(s):
    if "enum" in s:
        return [(v, None) for v in s["enum"]]
    out = []
    for alt in s["oneOf"]:
        for v in alt["enum"]:
            out.append((v, alt.get("description")))
    return out

def emit(name, s):
    out = doc(s.get("description"))
    if s.get("type") == "object":
        req = set(s.get("required", []))
        out += "export interface %s {\n" % name
        for prop, ps in s["properties"].items():
            t, nullable = ts_type(ps)
            out += doc(ps.get("description"), "  ")
            if (name, prop) in ALWAYS_PRESENT_NULLABLE:
                out += "  %s: %s | null;\n" % (prop, t)
            elif prop in req:
                out += "  %s: %s;\n" % (prop, t)
            else:
                out += "  %s?: %s;\n" % (prop, t)
        return out + "}\n"
    vals = enum_values(s)
    out += "export type %s =\n" % name
    for v, d in vals:
        out += doc(d, "  ")
        out += "  | %s\n" % json.dumps(v)
    return out.rstrip("\n") + ";\n"

def main():
    src, dst = (sys.argv[1], sys.argv[2]) if len(sys.argv) == 3 else ("result.schema.json", "result.d.ts")
    schema = json.load(io.open(src, encoding="utf-8"))
    parts = ["// 생성된 파일이다. 직접 고치지 않는다. 원본은 src/lib.rs, 생성은 generate.sh.\n"]
    parts.append(emit(schema["title"], schema))
    for name in sorted(schema["definitions"]):
        parts.append(emit(name, schema["definitions"][name]))
    io.open(dst, "w", encoding="utf-8").write("\n".join(parts))

if __name__ == "__main__":
    main()
