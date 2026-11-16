//! 결과 JSON의 원본 타입 (schemaVersion 1).
//!
//! 이 파일이 스키마의 원본이다. `result.schema.json`과 `result.d.ts`는 여기서 생성한다.
//! 직렬화 규칙: 필드 이름은 camelCase, 열거값은 kebab-case, 값이 없는 선택 필드는 쓰지 않는다.
//!
//! JSON Schema로 표현하지 못하는 규칙은 `check.py`가 검사한다:
//! - 자식이 있는 노드의 `bytes`는 자식 `bytes`의 합과 같다.
//! - 형제 노드의 `name`은 서로 다르고 UTF-8 바이트 순서로 정렬돼 있다.
//! - `completeness`의 합계와 `copies`가 트리와 맞는다.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub mod rules;

/// 지금 이 타입이 쓰는 스키마 버전.
pub const SCHEMA_VERSION: u32 = 1;

/// 결과 JSON의 최상위.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnatomyResult {
    /// 스키마 버전. 뷰어는 자기보다 큰 값을 만나면 그리지 않는다.
    pub schema_version: u32,
    /// 결과를 만든 도구의 버전. 스냅샷 비교에서는 뺀다.
    pub tool_version: String,
    /// 적용한 규칙 묶음의 버전. 스냅샷 비교에서는 뺀다.
    pub rules_version: String,
    /// 입력 전체의 SHA-256(16진수 소문자 64자). 아직 계산 중이면 null.
    /// 폴더 입력은 정렬된 경로와 파일별 해시로 만든 매니페스트의 해시다.
    pub input_sha256: Option<String>,
    pub input: InputInfo,
    /// 감지한 런타임. 바이트가 큰 순서. 하나도 없으면 `native` 하나가 들어간다.
    pub runtimes: Vec<RuntimeSummary>,
    pub completeness: Completeness,
    /// ABI나 아키텍처가 둘 이상일 때의 "벌 요약". 한 벌뿐이면 빈 배열.
    pub copies: Vec<CopySummary>,
    pub warnings: Vec<Warning>,
    /// 논리 트리의 뿌리. `kind`는 항상 `app`이다.
    pub root: Node,
}

/// 입력에 대한 사실. 사용자의 기기 경로는 담지 않는다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputInfo {
    pub packaging: Packaging,
    /// 화면에 보일 앱 이름. 번들 이름 또는 파일 이름에서 온다.
    pub name: String,
    /// 번들 식별자 또는 Android 패키지 이름.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    /// 앱이 스스로 밝힌 버전 문자열.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    /// 폴더 입력에서 링크를 구별하지 못해 총량이 정확하지 않을 수 있으면 true.
    pub approximate: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Packaging {
    MacosApp,
    Apk,
    Ipa,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeSummary {
    pub runtime: Runtime,
    /// 해부하는 런타임이면 true, 감지만 하는 런타임이면 false.
    pub dissected: bool,
    /// 이 런타임이 소유한 바이트. 감지만 한 런타임은 0일 수 있다.
    pub bytes: u64,
    pub confidence: Confidence,
    pub evidence: Evidence,
    /// 런타임의 버전을 읽었으면 적는다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// 감지할 수 있는 런타임. 감지만 하는 런타임은 표본으로 표식을 확인한 것만 실제로 나온다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Runtime {
    Electron,
    Flutter,
    ReactNative,
    /// 다른 런타임을 하나도 감지하지 못했을 때의 기본값.
    Native,
    Cef,
    Qt,
    Unity,
    Dotnet,
    Tauri,
    Cordova,
    /// Android에서는 Jetpack Compose와 구별되지 않는다.
    Compose,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

/// 왜 그렇게 판단했는지. 화면의 문장은 뷰어가 `kind`로 만든다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    pub kind: EvidenceKind,
    /// 일치한 경로, 접두어, 이름 등. 앱에서 뽑은 내용물은 넣지 않는다.
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum EvidenceKind {
    /// 메타데이터가 이름을 명시함 (확신도 높음).
    Metadata,
    /// 경로가 일치함.
    Path,
    /// 이름 접두어가 일치함.
    Prefix,
    /// 파일 안의 문자열 표식뿐임 (확신도 낮음).
    StringMarker,
    /// 파일의 위치로 판단함 (예: 주 실행 파일, `node_modules` 밖).
    Location,
    /// 확장자나 폴더로 판단함 (에셋).
    FileType,
    /// 다른 것이 감지되지 않아 붙인 기본값.
    Default,
}

/// 완전성 요약. 모든 값은 압축을 푼 바이트다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Completeness {
    /// 뿌리의 바이트와 같다.
    pub total_bytes: u64,
    /// 출처가 `unidentified`인 잎의 합.
    pub unidentified_bytes: u64,
    /// 안쪽을 보지 못한 덩어리(출처가 `bundled-app-code`인 잎)의 합.
    pub opaque_bytes: u64,
    /// `overhead` 노드의 합.
    pub overhead_bytes: u64,
    /// `shared` 노드의 합.
    pub shared_bytes: u64,
    /// `parse-failed` 노드의 수.
    pub parse_failed_nodes: u32,
}

/// 같은 코드의 한 벌 (ABI 하나 또는 아키텍처 하나).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CopySummary {
    pub container_type: ContainerType,
    /// 예: `arm64-v8a`, `x86_64`, `arm64`.
    pub name: String,
    /// 이 이름의 묶음 노드 전체의 합.
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Warning {
    /// 안정된 코드. 예: `W_IPA_NO_PAYLOAD`, `W_PARSE_FAILED`.
    pub code: String,
    /// 사람이 읽는 영어 문장. 기기 경로와 앱의 내용물은 넣지 않는다.
    pub message: String,
    /// 관련된 입력 안의 경로.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// 논리 트리의 노드.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Node {
    pub kind: NodeKind,
    /// 형제끼리 겹치지 않는 이름. 뿌리부터의 이름 목록이 노드의 주소다.
    pub name: String,
    /// 압축을 푼 바이트 수. 자식이 있으면 자식의 합과 같다. 2^53 미만이다.
    pub bytes: u64,
    /// 압축된 크기(보조 지표). ZIP 항목에서 온 노드에만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compressed_bytes: Option<u64>,
    /// 출처. `container`, `overhead`, `shared`, `link`, `parse-failed`에는 없다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<Origin>,
    /// 출처 판단의 확신도. 출처가 있을 때만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Evidence>,
    /// 규칙이 정한 분류. 규칙에 맞은 노드에만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<Category>,
    /// 맞은 규칙의 식별자.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    /// 맞은 규칙의 출처. 예: `builtin`, `libchecker-rules`, `user`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_source: Option<String>,
    /// 이 노드를 이루는 입력 안의 경로. 부모와 같으면 쓰지 않는다.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paths: Vec<String>,
    /// 파일 종류. 잎 노드에만 있다. 파일의 일부인 잎은 그 파일의 종류를 물려받는다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_kind: Option<FileKind>,
    /// `kind`가 `container`일 때만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_type: Option<ContainerType>,
    /// 실행 코드가 암호화돼 있으면 true (iOS의 `cryptid`).
    #[serde(default, skip_serializing_if = "is_false")]
    pub encrypted: bool,
    /// 한 덩어리로 묶여 있어 모듈 층이 없으면 true.
    #[serde(default, skip_serializing_if = "is_false")]
    pub no_module_layer: bool,
    /// DEX의 `parsed-file` 묶음에서 이름이 두 글자 이하인 클래스의 비율(0~1).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_name_ratio: Option<f64>,
    /// `kind`가 `link`일 때만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<LinkInfo>,
    /// `kind`가 `parse-failed`일 때만 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<ParseFailure>,
    /// 의존 관계의 끝점이 되는 노드에만 있는 번호. 한 결과 안에서 겹치지 않는다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<u32>,
    /// 이 노드가 필요로 한다고 파일에 적혀 있는 노드들의 `id`. 오름차순, 겹치지 않는다.
    /// 근거는 선언된 것뿐이다: npm 패키지의 `dependencies`, ELF의 `DT_NEEDED`, Mach-O의 `LC_LOAD_DYLIB`,
    /// 그리고 런타임 구조(Electron의 앱 묶음은 프레임워크를 필요로 한다). 실행해서 확인한 것이 아니다.
    /// 자식 노드는 부모의 `needs`를 물려받는다고 읽는다. 앱 밖의 것(시스템 라이브러리)은 담지 않는다.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub needs: Vec<u32>,
    /// 자식. 이름의 UTF-8 바이트 순서로 정렬한다. 잎이면 쓰지 않는다.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Node>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// 노드의 종류. 앞의 넷은 층이다(앱 1, 런타임 2, 라이브러리 3, 모듈 4).
/// 나머지는 층을 더하지 않고 부모와 같은 층에 놓인다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum NodeKind {
    App,
    Runtime,
    Library,
    Module,
    /// 묶음. 중첩 앱, 아키텍처 조각, ABI 폴더, 해부한 파일, 안쪽을 열지 않는 묶음.
    Container,
    /// 어느 구성 요소에도 속하지 않는 바이트 (헤더, 패딩, 서명, ZIP 목록).
    Overhead,
    /// 여러 구성 요소가 함께 쓰는 바이트 (DEX의 문자열 표 등).
    Shared,
    /// 링크. 바이트는 0이다.
    Link,
    /// 안쪽 파서가 실패한 덩어리. 바이트는 그 덩어리의 크기다.
    ParseFailed,
}

/// 출처. 화면의 색이 이 값을 따른다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Origin {
    /// 앱 자체의 코드.
    AppCode,
    /// 앱 코드가 한 덩어리로 묶인 것. 외부 코드가 섞여 있을 수 있다.
    BundledAppCode,
    /// 외부 라이브러리.
    Library,
    /// 런타임.
    Runtime,
    /// 에셋 (이미지, 글꼴, 소리, 영상, 현지화 파일 등).
    Asset,
    /// 규칙에 없는 부분. 오류가 아니다.
    Unidentified,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Category {
    Ads,
    Analytics,
    Payment,
    Ui,
    Network,
    Other,
}

/// 파일 종류. 확장자와 경로만으로 정한다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum FileKind {
    Executable,
    Script,
    Sourcemap,
    Wasm,
    Image,
    Font,
    Media,
    Localization,
    Data,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ContainerType {
    /// Android의 ABI 폴더 (`lib/arm64-v8a` 등).
    Abi,
    /// fat Mach-O의 아키텍처 조각.
    Arch,
    /// 중첩 `.app`, `.appex`, `.xpc`.
    NestedApp,
    /// 안쪽을 해부한 파일 (`app.asar`, DEX 파일들). 그 파일의 `overhead`와 `shared`가 이 아래에 놓인다.
    ParsedFile,
    /// 안쪽을 열지 않는 묶음 (Watch 앱, APK 안의 `.jar` 등).
    Opaque,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkInfo {
    /// 링크가 가리키는 경로 (입력에 적힌 그대로).
    pub target: String,
    /// 가리키는 곳이 입력 밖이면 true.
    pub external: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParseFailure {
    /// 실패한 파서. 예: `asar`, `dex`, `macho`, `axml`, `plist`.
    pub parser: String,
    /// 오류 코드. 예: `E_CORRUPT_INPUT`, `E_LIMIT_EXCEEDED`.
    pub code: String,
    /// 실패한 위치(그 덩어리 안의 바이트 오프셋).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 예시 파일을 타입으로 읽고, 다시 쓴 것이 같은 값인지 본다.
    #[test]
    fn example_round_trips() {
        for name in ["example-apk.json", "example-electron.json"] {
            let text = std::fs::read_to_string(format!("{}/{}", env!("CARGO_MANIFEST_DIR"), name)).unwrap();
            let parsed: AnatomyResult = serde_json::from_str(&text).unwrap();
            assert_eq!(parsed.schema_version, SCHEMA_VERSION);
            let again: AnatomyResult = serde_json::from_str(&serde_json::to_string(&parsed).unwrap()).unwrap();
            assert_eq!(parsed, again);
            // 예시 파일이 "값이 없는 필드는 쓰지 않는다"를 지키는지: 다시 쓴 JSON과 값이 같아야 한다.
            let a: serde_json::Value = serde_json::from_str(&text).unwrap();
            let b = serde_json::to_value(&parsed).unwrap();
            assert_eq!(a, b, "{name}: 기본값을 적었거나 필드 표기가 다르다");
        }
    }

    #[test]
    fn unknown_field_is_rejected() {
        let bad = r#"{"kind":"app","name":"x","bytes":1,"surprise":true}"#;
        assert!(serde_json::from_str::<Node>(bad).is_err());
    }
}
