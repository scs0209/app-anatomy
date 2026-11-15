#!/bin/sh
# 해석기를 WebAssembly로 지어 dist/anatomy_core.wasm 에 둔다. 사용법: sh core/build-wasm.sh
# 지은 파일에 이 기기의 경로(홈 폴더, 사용자 이름)가 남지 않도록 경로를 바꿔 넣고, 남았으면 실패한다.
set -eu
cd "$(dirname "$0")"
root=$(cd .. && pwd)
cargo_home=${CARGO_HOME:-$HOME/.cargo}
# 더 구체적인 경로를 뒤에 둔다(rustc는 뒤에 적힌 것부터 맞춰 본다).
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$HOME=/home --remap-path-prefix=$root=/src --remap-path-prefix=$cargo_home=/cargo" \
  cargo build --release --target wasm32-unknown-unknown
out=target/wasm32-unknown-unknown/release/anatomy_core.wasm
if LC_ALL=C grep -a -q -F "$HOME" "$out"; then
  echo "build-wasm: $out still contains the home path ($HOME)" >&2
  exit 1
fi
mkdir -p ../dist
cp "$out" ../dist/anatomy_core.wasm
echo "wrote dist/anatomy_core.wasm ($(wc -c < ../dist/anatomy_core.wasm | tr -d ' ') bytes)"
