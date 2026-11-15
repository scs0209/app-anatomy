# 규칙 파일 (formatVersion 1, 초안)

기준일: 2026-11-14. 계획 Next Steps 3번의 "규칙 파일" 스키마다. 계획 9.2절의 조건을 옮겼다. 계획에 없던 7가지는 2026-11-14에 사용자가 하나씩 보고 확정했다(끝의 표).

## 파일

| 파일 | 무엇 |
|---|---|
| `../schema/src/rules.rs` | **원본.** Rust 타입과 검증 함수 `validate` |
| `../schema/rules.schema.json` | JSON Schema (생성물). 편집기와 CI를 위한 문서다 |
| `../schema/rules.d.ts` | TypeScript 타입 (생성물) |
| `../schema/example-rules.json` | 손으로 쓴 예시 5건. 대상 6종 가운데 5종과 일치 방식 3종을 쓴다(`path` 대상은 예시에 없다) |
| `imported/libchecker-rules.json` | LibChecker-Rules에서 변환한 규칙 632건 (Apache-2.0) |
| `tools/convert-libchecker.py` | 그 변환 스크립트 |

검사:

```bash
cd schema && cargo run -q --bin check-rules example-rules.json ../rules/imported/libchecker-rules.json
```

## 형식

파일 하나는 **출처 하나**의 규칙만 담는다. 라이선스가 다른 규칙을 한 파일에 섞지 않는다.

```
{
  "formatVersion": 1,
  "source": { "id", "name", "license", "url"?, "revision"?, "modified", "notice"? },
  "rules": [ { "id", "name", "kind", "runtime"?, "category", "vendor"?, "homepage"?, "match": [ … ] } ]
}
```

- `source.id`가 결과 JSON의 `ruleSource`, 규칙의 `id`가 `ruleId`가 된다.
- `kind`는 `runtime` 또는 `library`. `runtime`이면 어느 런타임인지 `runtime` 필드에 적는다.
- `category`는 광고, 분석, 결제, UI, 네트워크, 기타.
- `match`는 조건의 목록이고 하나라도 맞으면 규칙이 맞은 것이다.

### 일치 조건

`{ "target", "type", "value", "packaging"?, "file"?, "maxFileBytes"? }`

| `target` | 맞춰 보는 것 | 쓸 수 있는 `type` | 근거 종류 → 확신도 |
|---|---|---|---|
| `file-name` | 파일 이름(경로의 마지막 마디) | literal, prefix, glob | 경로 → 중간 |
| `path` | 앱 뿌리부터의 경로 | literal, prefix, glob | 경로 → 중간 |
| `framework-name` | `.framework`를 뺀 이름 | literal, prefix | 경로 → 중간 |
| `dex-class` | `com/example/Foo` 형태의 클래스 이름 | literal, prefix | 접두어 → 중간 |
| `npm-package` | `package.json`이 밝힌 이름 | literal | 메타데이터 → 높음 |
| `string-marker` | 파일 안의 문자열 | literal | 문자열 표식 → 낮음 |

- 정규식은 없다(계획 9.2).
- 글롭은 `*`만 쓴다. `*`는 `/`를 넘지 않고, 두 개까지이며, `**`는 안 된다. 고정 글자가 3자 이상이어야 한다.
- 경로와 클래스의 접두어는 `/`로 끝나야 한다. `com/google`이 `com/googlex/…`에 맞는 일을 막는다.
- `string-marker`는 `file`(찾을 파일의 경로)과 `maxFileBytes`(이보다 큰 파일에서는 찾지 않음, 최대 64 MiB)가 반드시 있어야 한다(계획 9.2).
- 값은 대소문자를 구별한다. `packaging`이 없으면 모든 포장 형식에 적용한다.

### 우선순위 (계획 9.2 그대로)

라이브러리별 규칙 > 일반 구조 규칙. 같은 수준이면 더 길게 일치한 규칙. 동률이면 규칙 `id`의 순서. 런타임 해부기가 소유를 선언한 경로에는 규칙을 적용하지 않는다(계획 8.5의 소유 순서).

## 검증

`validate`가 검사하는 것(스키마로 표현하지 못하는 규칙):

- `id`의 글자(소문자, 숫자, `.`, `_`, `-`), 파일 안에서 겹치지 않음, 바이트 순서 정렬
- 대상마다 허용된 일치 방식
- 글롭 문법, 접두어의 끝 글자와 최소 길이, 경로의 `..`과 `//`
- `string-marker`의 `file`과 `maxFileBytes`
- `homepage`와 `source.url`은 `https:`만
- 가져온 규칙(`revision`이 있음)은 `modified`가 true

모르는 필드가 있으면 읽는 단계에서 거부하고 줄과 칸을 알려 준다.

## 실제 데이터로 확인한 것

LibChecker-Rules(커밋 `4189fc0`)를 변환했다.

| 항목 | 수 |
|---|---|
| 원본 라이브러리 항목 | 962 |
| 변환한 규칙 | 632 |
| 변환한 일치 조건 (네이티브 라이브러리 파일 이름, 정확 일치) | 1,558 |
| 버린 조건: 정규식 | 123 |
| 버린 조건: 네이티브 라이브러리가 아닌 것 | 1,372 |
| 네이티브 정확 일치가 하나도 없어 빠진 항목 | 330 |
| `https:`가 아니라서 뺀 링크 | 18 |

- 변환 결과는 JSON Schema 검증과 `validate`를 모두 통과한다. 파일 크기는 370 KB다.
- 같은 파일 이름이 두 규칙에 걸린 경우는 없다.
- 가져오지 않은 것: 설명 문구, 아이콘, 기여자 이름.
- 원본에 NOTICE 파일은 없었다. 고지 문구는 `source.notice`에 적었다.

Android 표본 5개의 arm64 네이티브 라이브러리에 적용해 봤다(파일 이름만 대조):

| 표본 | 라이브러리 파일 | 맞은 것 | 바이트 기준 | 안 맞은 가장 큰 것 |
|---|---|---|---|---|
| LocalSend | 5 | 4 | 61% | `librust_lib_localsend_app.so` (앱 자체의 Rust 코드) |
| Immich | 10 | 7 | 85% | `libcronet.143.0.7445.0.so` |
| Rocket.Chat | 42 | 38 | 93% | `libwatermelondb-jsi.so` |
| Joplin Android | 27 | 23 | 87% | `libQuickCrypto.so` |
| NewPipe | 2 | 2 | 100% | — |

- 이 숫자에는 런타임 해부기가 소유할 라이브러리(`libflutter.so`, `libreactnative.so` 등)도 들어 있다. 실제 결과의 "식별 비율"과는 다르다.
- `libcronet.143.0.7445.0.so`처럼 이름에 버전이 든 파일은 정확 일치로 못 잡는다. 글롭(`libcronet.*.so`)이 필요한 실제 사례다.

## 확인하지 못한 것

- 코어에서 규칙을 색인(트라이 또는 해시)으로 대조하는 구현. 여기 있는 것은 형식과 검증뿐이다.
- 규칙 오류에 `파일:줄`을 붙이는 것(계획 12절). 형식 오류에는 줄과 칸이 나오지만, `validate`의 오류에는 규칙 순번과 `id`만 나온다.
- `rules.d.ts`를 TypeScript 컴파일러로 검사하지 못했다.
- Android 구성 요소 규칙 1,372건을 `dex-class`로 옮길 수 있는지.
- 변환한 규칙 가운데 틀린 것이 있는지. 원본의 정확도를 따로 검증하지 않았다.

## 확정 기록 (2026-11-14)

사용자가 하나씩 보고 정했다.

| 정한 것 | 이유 | 고르지 않은 것 |
|---|---|---|
| 규칙 파일은 JSON | JSON Schema로 검증한다는 계획과 맞고 추가 파서가 필요 없다 | YAML, TOML. 손으로 쓰기는 더 편하다 |
| 파일 하나에 출처 하나 | Apache-2.0과 ODbL 규칙을 섞지 않기 위해서다. 고지 문구를 파일에 붙일 수 있다 | 규칙마다 출처를 적는다 |
| 대상 6종 | 표본에서 실제로 필요했던 것들이다 | `path` 하나로 통일하고 글롭으로 표현 |
| 글롭은 `*`만, 두 개까지, `/`를 넘지 않음 | 계획의 "제한된 글롭"을 구체화했다. 색인으로 대조할 수 있게 하려는 것이다 | `**` 허용 |
| 접두어는 `/`로 끝나야 함 | 다른 패키지에 잘못 맞는 일을 막는다 | 제한 없음 |
| 문자열 표식의 파일 크기 상한은 최대 64 MiB | 계획은 "크기 상한을 지정"만 요구한다. 상한의 상한을 뒀다 | 제한 없음 |
| 가져온 규칙의 분류는 모두 "기타" | 원본에 분류가 없다. 계획 9.2가 이미 정한 내용이라 묻지 않았다 | — |
| 변환한 규칙의 `id`는 `lc.` + 원본 UUID(소문자) | **초안과 다르게 정해졌다.** 원본이 이름을 바꿔도 식별자가 그대로라 다시 가져와도 결과가 흔들리지 않는다. 읽기는 어렵다 | 파일 이름에서 만든 값(초안) |
