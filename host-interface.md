# 앱 해부도 — 호스트 인터페이스 (ABI 버전 1)

기준일: 2026-11-14. 계획 Next Steps 3번의 마지막 항목이다(계획 8.2).

코어(WebAssembly)는 파일 시스템과 시계를 직접 쥐지 않는다. 껍데기(브라우저 Worker, Node)가 가져오기 함수로 다섯 가지를 준다: **항목 목록, 범위 읽기, 링크 대상, 진행 보고, 시계.** 이 문서는 그 경계를 정한다.

계획이 정한 것은 그대로 옮겼다. 계획에 없던 8가지는 2026-11-14에 사용자가 하나씩 보고 확정했다(끝의 표). 시제품 코어(`wasm-proto/core`)에 구현해 Node와 브라우저에서 돌려 봤다.

## 구현 위치

| 파일 | 무엇 |
|---|---|
| `wasm-proto/core/src/lib.rs` | 시제품 코어. 이 인터페이스를 구현한다 |
| `wasm-proto/host/loader.mjs` | 브라우저와 Node가 함께 쓰는 로더. 가져오기 함수를 만들고 코어를 부른다 |
| `wasm-proto/host/node-host.mjs` | Node용 입력(파일 하나, 폴더) |
| `wasm-proto/web/worker.js` | 브라우저 Worker용 입력(`FileReaderSync`) |
| `wasm-proto/host/test.mjs` | 인터페이스 시험 19건 |

## 가져오기 함수 (호스트 → 코어), 모듈 이름 `anatomy_host`

| 함수 | 시그니처 | 뜻 |
|---|---|---|
| `host_listing_len` | `() -> u32` | 항목 목록의 바이트 길이 |
| `host_listing_read` | `(ptr, len) -> u32` | 항목 목록을 코어 메모리에 쓴다. 쓴 길이를 돌려준다 |
| `host_read` | `(file: u32, offset: f64, ptr, len: u32) -> i32` | `file`번 항목의 `offset`부터 `len`바이트를 쓴다. 읽은 바이트 수. 파일 끝에서만 짧게 읽는다. 실패하면 음수. `offset`은 2^53 미만의 정수다. 코어 안에서는 64비트 정수로 다루고 경계에서만 `f64`로 넘긴다. 2^53 이상의 위치는 읽지 않고 `E_IO`로 끝낸다 |
| `host_link_target` | `(file: u32, ptr, cap: u32) -> i32` | 링크가 가리키는 경로를 쓴다. 길이를 돌려준다. 모르면 음수 |
| `host_progress` | `(stage: u32, detail_ptr, detail_len)` | 단계 알림. 진행률 숫자는 없다 |
| `host_now_ms` | `() -> f64` | 단조 증가하는 밀리초 시계 |

### 항목 목록의 형식

레코드를 이어 붙인 이진 데이터다. 모두 리틀 엔디언.

```
[u32 경로 길이][경로 UTF-8][u64 크기][u8 종류: 0 파일, 1 링크]
```

- 레코드의 순번(0부터)이 `host_read`와 `host_link_target`의 `file`이다.
- 파일 하나짜리 입력(ZIP, APK, IPA)은 레코드가 하나다. 폴더 입력은 파일과 링크마다 하나씩이다. 폴더는 넣지 않는다.
- 경로는 `/`로 나눈 상대 경로이고 첫 마디가 `.app` 폴더 이름이다. 기기의 절대 경로는 넣지 않는다.
- 줄 바꿈이나 탭이 든 이름도 그대로 전달된다. 텍스트 형식이 아니라 길이를 앞에 붙인 형식이기 때문이다.
- 폴더 드롭의 항목 열거는 브라우저 메인 스레드가 하고 목록을 Worker로 넘긴다(계획 8.2).

### 진행 단계

| 값 | 이름 | `detail` | 화면(계획 10.11) |
|---|---|---|---|
| 1 | `open` | 없음 | "열기" |
| 2 | `runtime-detected` | 런타임 이름 | 트리보다 먼저 글자로 알린다 |
| 3 | `analyzing` | 없음 | "구성 분석" |
| 4 | `done` | 없음 | — |

## 내보내는 함수 (코어 → 호스트)

| 함수 | 시그니처 | 뜻 |
|---|---|---|
| `memory` | — | 선형 메모리 |
| `anatomy_abi_version` | `() -> u32` | 1. 로더는 값이 다르면 쓰지 않는다 |
| `anatomy_alloc` / `anatomy_free` | `(len) -> ptr` / `(ptr, len)` | 호스트가 코어 메모리에 바이트를 넘길 때 쓴다 |
| `anatomy_init` | `(rules_ptr, rules_len) -> i32` | 규칙 파일 하나를 넘긴다. 여러 번 부를 수 있다 |
| `anatomy_analyze` | `(input_kind: u32, options_ptr, options_len) -> i32` | 해석한다. `input_kind` 0은 파일 하나, 1은 폴더 |
| `anatomy_finalize` | `() -> i32` | 입력 해시를 계산해 최종 결과를 낸다. `anatomy_analyze` 뒤에 부른다 |
| `anatomy_result_ptr` / `anatomy_result_len` | `() -> ptr` / `() -> u32` | 결과 버퍼. 다음 호출까지 유효하다 |

### 호출 순서

```
인스턴스 생성 → anatomy_abi_version 확인
→ anatomy_init (규칙 파일마다 한 번)
→ anatomy_analyze   : 결과 버퍼 = 트리(inputSha256은 null). 화면에 바로 그린다
→ anatomy_finalize  : 결과 버퍼 = inputSha256이 채워진 최종 결과 JSON
→ 인스턴스를 버린다
```

- **인스턴스 하나는 입력 하나만 해석한다.** 브라우저는 입력마다 새 Worker를 쓴다(계획 10.15).
- 해시는 트리보다 훨씬 비싸서 따로 뗐다. 204 MB ZIP에서 트리는 23 ms, 해시는 460 ms였다.

### 옵션 (`anatomy_analyze`의 JSON)

| 필드 | 기본값 | 뜻 |
|---|---|---|
| `deadlineMs` | 0 (없음) | `anatomy_analyze`가 쓸 수 있는 시간. 코어가 범위 읽기 때마다 `host_now_ms`로 확인한다 |
| `maxNodes` | 1,000,000 | 노드 수 상한 |

기한은 `anatomy_finalize`에는 적용하지 않는다.

### 상태 코드와 오류

`anatomy_init`, `anatomy_analyze`, `anatomy_finalize`는 0이면 성공이다. 0이 아니면 결과 버퍼에 오류 JSON이 있고, 상태 코드는 명령줄의 종료 코드와 같다(계획 12절).

```json
{ "code": "E_LIMIT_EXCEEDED", "message": "time limit exceeded" }
```

| 상황 | 코드 | 상태 |
|---|---|---|
| ZIP 기반 입력이 아님 | `E_UNSUPPORTED_FORMAT` | 3 |
| 기한 초과 | `E_LIMIT_EXCEEDED` | 4 |
| 노드 상한 초과 | `E_TOO_LARGE` | 4 |
| 항목 목록이 깨짐 | `E_CORRUPT_INPUT` | 4 |
| `host_read`가 음수 | `E_IO` | 2 |
| 규칙이 잘못됨 | `E_RULES_INVALID` | 2 |
| 코어의 패닉과 트랩 | `E_INTERNAL` | — (로더가 잡는다) |

- 트랩이 나면 로더가 `E_INTERNAL`로 바꾸고 그 인스턴스를 다시 쓰지 않는다(계획 12절).
- 호스트의 읽기 함수가 예외를 던지면 로더가 음수로 바꿔 `E_IO`가 된다. 예외가 WebAssembly 경계를 넘어가지 않는다.
- 안쪽 파서의 실패는 오류가 아니다. 결과 안의 `parse-failed` 노드와 `warnings[]`로 나간다.

## 호스트별 차이

| | 브라우저 Worker | Node (명령줄) |
|---|---|---|
| 범위 읽기 | `FileReaderSync`로 `Blob` 조각을 읽는다 | `fs.readSync` |
| 링크 대상 | 모른다(항상 음수) | `fs.readlinkSync` |
| 폴더 항목 | 메인 스레드가 열거해 넘긴다 | 직접 훑는다 |
| 기한 | `deadlineMs`에 더해 메인 스레드 타이머가 Worker를 종료한다 | `deadlineMs`만 |
| 취소 | 메인 스레드가 Worker를 종료한다 | 프로세스 종료 |

코어의 메모리 상한은 양쪽이 같다(32비트 WebAssembly, 계획 8.1).

## 필요한 플랫폼 기능

이 목록이 지원 브라우저와 최소 Node 버전을 정한다(계획 8.1).

- WebAssembly MVP. `i64`가 경계를 넘지 않으므로 BigInt 연동은 필요 없다
- **모듈 Worker**(`new Worker(url, { type: "module" })`). 로더를 Worker와 Node가 같은 파일로 쓰기 위해서다
- Worker 안의 `FileReaderSync`
- 콘텐츠 보안 정책의 `'wasm-unsafe-eval'`

## 확인한 것

Node v26.11.1에서 시험 19건이 모두 통과했다.

- 가져오기 6개와 내보내기 이름이 이 문서와 같다.
- ZIP 입력: 진행 단계가 `open > runtime-detected:electron > analyzing > done` 순서로 온다. 해시가 파일의 SHA-256과 같다.
- 폴더 입력: 같은 앱의 ZIP과 총량이 같다(613,705,107바이트). 링크 14개의 대상을 호스트가 모두 알려 준다. 해시가 두 번 돌려도 같다.
- 오류: 기한 초과, 읽기 실패(음수 반환과 예외 둘 다), 노드 상한, ZIP이 아닌 입력이 각각 맞는 코드와 상태로 나온다.
- 줄 바꿈, 탭, 한글, 이모지, 따옴표가 든 경로 5개가 그대로 전달된다.
- 규칙 파일을 두 번 넘길 수 있고 적용된다.
- 오프셋이 JavaScript의 숫자(BigInt가 아님)로 전달된다.

브라우저(앱 내장 브라우저, Chromium 156)에서:

- 모듈 Worker가 콘텐츠 보안 정책(`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'`) 아래에서 로드된다.
- Joplin ZIP의 해시가 Node와 같다(`9906830034c6323a…`).
- 트리가 해시보다 먼저 온다(23 ms 대 483 ms).
- 기한을 0.001 ms로 주면 `E_LIMIT_EXCEEDED`가 온다.

표본 12개의 측정값은 인터페이스를 바꾸기 전과 같은 수준이다(가장 느린 표본 130 ms, 코어 메모리 최대 57.7 MB).

## 확인하지 못한 것

- **Safari와 Firefox.** 모듈 Worker와 `FileReaderSync`가 세 브라우저에서 모두 되는지 직접 확인하지 않았다.
- 실제 트랩이 났을 때의 동작. 로더의 처리는 있지만 시제품 코어에서 트랩을 일부러 내 보지 않았다.
- 메모리 부족이 `E_LIMIT_EXCEEDED`로 나오는지(계획 12절). 시제품은 메모리 부족을 따로 처리하지 않는다.
- 브라우저의 폴더 입력. 사람이 끌어다 놓아야 해서 자동으로 확인하지 못했다.
- 폴더 해시의 정의가 계획 8.7("정렬된 경로와 파일별 해시로 만든 매니페스트의 해시")과 충분히 같은지. 시제품은 `경로 + NUL + 파일 해시`를 경로순으로 이어 해시한다. 링크는 넣지 않는다.

## 시제품과 실제 코어의 차이

- 시제품의 결과는 최종 스키마(`schema/`)가 아니라 측정용 짧은 형식이다.
- 시제품의 `anatomy_finalize`는 `{"inputSha256": "…"}`만 낸다. 실제 코어는 해시를 채운 최종 결과 JSON 전체를 낸다(계획 8.7: 최종 JSON의 바이트는 코어가 만든다).
- 시제품의 런타임 감지는 경로 몇 개만 본다.
- 시제품에는 `anatomy_debug_stat`이라는 측정용 내보내기가 있다. 인터페이스의 일부가 아니다.
- `.wasm` 크기가 124 KB에서 174 KB로 늘었다. 옵션과 오류의 JSON 처리가 들어가서다.

## 확정 기록 (2026-11-14)

사용자가 하나씩 보고 정했다.

| # | 결정 | 고른 것 | 초안과 같은가 |
|---|---|---|---|
| 1 | 경계 방식 | 숫자와 포인터만 오가는 함수를 직접 정의. `wasm-bindgen`은 쓰지 않음 | 같음 |
| 2 | 오프셋의 형 | **부동소수점(`f64`)**. 2^53 미만의 정수만 | **다름** (초안은 `i64`와 BigInt) |
| 3 | 항목 목록 | 이진 레코드를 한 번에 | 같음 |
| 4 | 해시 | 코어가 따로, 트리 뒤에(`anatomy_finalize`) | 같음 |
| 5 | 옵션과 오류 | JSON | 같음 |
| 6 | 상태 코드 | 명령줄 종료 코드와 같은 값 | 같음 |
| 7 | 인스턴스 | 입력 하나만 | 같음 |
| 8 | Worker | 모듈 Worker | 같음 |

묻지 않은 것: 진행 단계 4개. 계획 10.11의 세 단계에 "끝"을 더한 것뿐이다.

2번의 결과: 브라우저 기능 의존이 하나 줄었다(BigInt 연동이 필요 없다). 2^53바이트(약 9천조 바이트)를 넘는 위치는 읽을 수 없는데, 노드 수 상한과 메모리 상한이 그보다 훨씬 먼저 걸린다. 바꾼 뒤 시험 19건과 표본 12개를 다시 돌렸고 결과는 같았다.
