# 표본 12개의 정답 (초안)

기준일: 2026-11-14. 계획 Next Steps 4번이다. 정책 8가지는 사용자가 확정했다. 다만 내 판단으로 붙인 항목이 남아 있어 **파일은 아직 초안이다**(`"status": "draft"`).

## 무엇이 측정이고 무엇이 판단인가

- **바이트 수는 측정값이다.** 시제품 코어가 표본을 읽어 낸 트리에서 가져왔다. 표본 파일의 SHA-256도 함께 적었다.
- **출처(`origin`)는 판단이다.** `tools/draft-answers.py`의 규칙으로 붙였다. 항목마다 근거(`basis`)와 상태(`status`)를 적었다.
- 런타임은 과제에서 표식 파일로 확인한 값이다(`app-anatomy-findings.md`).

| `status` | 뜻 | 항목 수 |
|---|---|---|
| `clear` | 판정 규칙이 분명하거나 사용자가 정책으로 확정했다 | 140 |
| `judgment` | 내가 판단했다. 대체로 맞다고 보지만 확인이 필요하다 | 98 |
| `needs-review` | 어느 쪽인지 정하지 못했다 | 0 |

## 요약

비율은 "전체 대비, 정답에 실은 항목만"이다. 실은 항목의 합이 "실은 비율"이고 나머지는 작은 파일, `overhead`, `shared`, 싣지 않은 패키지다.

| 표본 | 런타임 | 전체 | 항목 | 런타임 | 외부 라이브러리 | 자체 코드 | 묶음 단위 | 에셋 | 미식별 | 실은 비율 |
|---|---|---|---|---|---|---|---|---|---|---|
| [01-joplin](01-joplin.json) | electron | 613.7 MB | 24 | 47% | 39% | — | 12% | — | 1% | 99% |
| [02-mattermost-desktop](02-mattermost-desktop.json) | electron | 308.6 MB | 17 | 95% | 2% | — | 3% | — | — | 100% |
| [03-standardnotes](03-standardnotes.json) | electron | 474.5 MB | 22 | 53% | 12% | — | 19% | — | — | 84% |
| [04-localsend](04-localsend.json) | flutter | 50.1 MB | 18 | 23% | 1% | 0% | 29% | 8% | 37% | 98% |
| [05-appflowy](05-appflowy.json) | flutter | 297.8 MB | 12 | 5% | 11% | — | 70% | 9% | — | 95% |
| [06-immich](06-immich.json) | flutter | 83.2 MB | 23 | 14% | 16% | 0% | 31% | 19% | 16% | 96% |
| [07-mattermost-mobile](07-mattermost-mobile.json) | react-native | 133.7 MB | 9 | 4% | 14% | — | 73% | 2% | — | 93% |
| [08-rocketchat](08-rocketchat.json) | react-native | 224.9 MB | 33 | 16% | 54% | 0% | 7% | 6% | 7% | 90% |
| [09-joplin-android](09-joplin-android.json) | react-native | 200.6 MB | 28 | 16% | 42% | 0% | 15% | 4% | 7% | 84% |
| [10-newpipe](10-newpipe.json) | compose | 25.3 MB | 15 | — | 35% | 3% | — | 27% | 3% | 68% |
| [11-maccy](11-maccy.json) | native | 10.6 MB | 3 | — | 26% | — | 48% | 17% | — | 90% |
| [12-utm](12-utm.json) | native | 824.8 MB | 34 | — | 53% | — | 1% | — | 40% | 94% |

"전체"는 ZIP 항목의 압축을 푼 크기의 합이다. APK와 IPA는 실제 결과에서 여기에 ZIP 목록의 `overhead`가 더해진다(계획 8.4). 그 값은 코어가 정해져야 알 수 있어 넣지 않았다.

## 파일 형식

```
{
  "answerFormat": 1,
  "status": "draft",
  "sample":   { id, app, version, packaging, file, fileBytes, sha256, source, license },
  "expected": {
    "entryBytes":  전체 바이트,
    "runtimes":    [ { runtime, dissected } ],
    "components":  [ { match: { target, value }, layer, origin, bytes, status, basis, note? } ],
    "listedBytes", "listedShare",
    "facts":       { 표본마다 다른 측정값: ABI 목록, DEX 공유 바이트, asar의 패키지 수 등 }
  },
  "surprisingFact": 과제에서 적은 한 줄
}
```

`match`는 규칙 파일의 일치 대상과 같은 이름을 쓴다(`file-name`, `path`, `framework-name`, `dex-class`, `npm-package`). 여러 ABI에 든 `.so`는 합친 바이트와 `abiCount`를 적었다.

## 확정한 정책 (2026-11-14)

사용자가 하나씩 보고 정했다. 원칙은 **"정답은 도구가 낼 수 있는 값에 맞춘다. 규칙에 없으면 미식별이 정답이다"**로 모인다.

| # | 질문 | 고른 것 | 초안과 같은가 |
|---|---|---|---|
| 1 | Electron 앱의 주 실행 파일 | 런타임. Electron 해부기가 이 경로의 소유를 선언한다 | 같음 |
| 2 | 런타임의 자바 쪽 코드(`io/flutter`, `com/facebook`) | **런타임** | **다름** (초안은 외부 라이브러리) |
| 3 | 앱이 직접 빌드한 네이티브 라이브러리 | **미식별**. 도구는 이름만으로 자체 코드라고 단정하지 않는다 | **다름** (초안은 묶음 단위) |
| 4 | Flutter 에셋 묶음 | 묶음 전체가 에셋. 안의 파일은 파일 종류로 구별한다 | 같음 |
| 5 | UTM의 펌웨어 묶음(`qemu/`, 331 MB) | **미식별**. 확장자가 에셋 목록에 없고 규칙도 없다 | **다름** (초안은 에셋) |
| 6 | 앱 확장(`.appex`) | **묶음에는 출처를 적지 않고 안쪽만 적는다** | **다름** (초안은 확장 전체가 묶음 단위) |
| 7 | 이름이 줄여진 DEX 클래스 | 미식별이 정답. 라이브러리 이름을 붙이면 오탐이다 | 같음 |
| 8 | Joplin의 `Resources/build` | **`tesseract.js-core`는 외부 라이브러리, 규칙을 손으로 쓴다.** 나머지는 미식별 | **다름** (초안은 전체 미식별) |

묻지 않은 것: NewPipe의 런타임은 `compose`다(Android에서도 Compose를 감지한다는 앞선 확정).

이 결정으로 바뀐 것:

- `rules/builtin/builtin.json`을 만들고 첫 내장 규칙 `lib.tesseract-js-core`를 넣었다. 검증을 통과한다.
- LocalSend의 미식별이 37%, UTM의 미식별이 40%가 됐다. 규칙을 쓰기 전의 정답이다.
- Mattermost Mobile의 앱 확장은 실행 파일(묶음 단위)만 정답에 싣고, 확장 전체의 크기는 `facts.appExtensions`에 적었다.
- 2번의 `com/facebook`은 React Native 표본에서만 런타임으로 적었다. 이 접두어 아래에는 다른 라이브러리도 섞여 있어서 더 긴 접두어로 좁혀 바이트를 다시 나눠야 한다. 지금 숫자는 `com/facebook` 전체다.

## 아직 확인이 필요한 것 (`judgment` 98개)

| 근거 | 항목 수 |
|---|---|
| 프레임워크 이름이 드러난 단위(일반 구조 규칙) | 53 |
| 널리 알려진 패키지 접두어 | 32 |
| 주 실행 파일 | 4 |
| assets/ 아래(계획 9.1: 경로로 에셋 판정) | 4 |
| asar 안에서 node_modules 밖에 있는 파일의 합 | 3 |
| 런타임의 자바 쪽 코드(확정: 런타임) | 2 |

대부분 "이름이 드러난 프레임워크는 외부 라이브러리"와 "널리 알려진 패키지 접두어는 외부 라이브러리"다. 틀릴 수 있는 경우: 앱이 직접 만든 프레임워크(예: AppFlowy의 `appflowy_native_update`, `flowy_infra_ui`), `com/google` 아래의 서로 다른 라이브러리들.

## 확인하지 못한 것

- **가져온 규칙의 정확도.** LibChecker 규칙에 맞은 `.so`는 `clear`로 두었지만, 그 규칙이 옳은지는 따로 확인하지 않았다. 예: `libappmodules.so`는 React Native 앱마다 새로 빌드되는 코드일 수 있다.
- **널리 알려진 패키지 접두어.** `com/google`, `androidx/…` 등을 외부 라이브러리로 둔 것은 내 지식에 근거한다. `com/google` 아래에는 서로 다른 라이브러리가 여럿 들어 있다.
- Mach-O 안쪽, Flutter 스냅샷 안쪽, JS 번들 안쪽. v1의 깊이 표가 보지 않는 곳이라 정답도 한 덩어리로 적었다.
- macOS 앱의 유니버설 실행 파일(Maccy, Standard Notes의 `python3`)의 아키텍처 조각별 바이트.
- Joplin 두 개의 라이선스(GitHub가 판별하지 못함).
- REA 같은 다른 도구로 교차 확인하지 않았다(계획은 "쓸 수 있다"고만 했다).

## 다시 만드는 법

```bash
node samples-answers/tools/dump-trees.mjs <트리 폴더> <표본 파일…>
```

```bash
python3 samples-answers/tools/draft-answers.py <트리 폴더> rules/imported/libchecker-rules.json samples-answers
```

```bash
python3 samples-answers/tools/check-answers.py samples-answers
```

`draft-answers.py`를 다시 돌리면 손으로 고친 내용이 덮어써진다. 확정한 뒤에는 `"status"`를 `"confirmed"`로 바꾸고 스크립트로 다시 만들지 않는다.
