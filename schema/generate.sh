#!/bin/sh
# Rust 타입(src/lib.rs, src/rules.rs)에서 JSON Schema 와 TypeScript 타입을 다시 만들고 예시와 규칙 파일을 검사한다.
# CI 에서는 이 스크립트를 돌린 뒤 `git diff --exit-code` 로 커밋된 것과 같은지 본다.
set -eu
cd "$(dirname "$0")"
cargo run -q --bin emit-schema result > result.schema.json
cargo run -q --bin emit-schema rules > rules.schema.json
python3 gen-ts.py result.schema.json result.d.ts
python3 gen-ts.py rules.schema.json rules.d.ts
python3 gen-examples.py
cargo test -q
python3 check.py example-apk.json example-electron.json
cargo run -q --bin check-rules example-rules.json ../rules/imported/*.json
