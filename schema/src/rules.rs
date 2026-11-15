//! 규칙 파일의 원본 타입 (formatVersion 1, 초안).
//!
//! 규칙 파일 하나는 출처 하나에서 온 규칙만 담는다. 라이선스가 다른 규칙을 한 파일에 섞지 않는다.
//! 결과 JSON의 `ruleSource`는 파일의 `source.id`, `ruleId`는 규칙의 `id`다.
//!
//! JSON Schema로 표현하지 못하는 규칙은 [`validate`]가 검사한다. 코어도 같은 검사를 한다.

use crate::{Category, Packaging, Runtime};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const RULES_FORMAT_VERSION: u32 = 1;
/// 글롭 하나에 쓸 수 있는 `*`의 최대 개수.
pub const MAX_GLOB_STARS: usize = 2;
/// 문자열 표식을 찾을 파일의 크기 상한으로 적을 수 있는 최댓값.
pub const MAX_MARKER_FILE_BYTES: u64 = 64 * 1024 * 1024;

/// 규칙 파일의 최상위.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleFile {
    /// 규칙 파일 형식의 버전.
    pub format_version: u32,
    pub source: RuleSource,
    /// 규칙. `id`의 UTF-8 바이트 순서로 정렬한다.
    pub rules: Vec<Rule>,
}

/// 이 파일의 규칙이 어디서 왔는지. 가져온 규칙의 고지 의무를 여기에 적는다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleSource {
    /// 출처 식별자. 결과 JSON의 `ruleSource`가 된다. 예: `builtin`, `libchecker-rules`, `user`.
    pub id: String,
    /// 사람이 읽는 출처 이름.
    pub name: String,
    /// 이 규칙들의 라이선스(SPDX 식별자). 예: `Apache-2.0`.
    pub license: String,
    /// 원본의 주소. `https:`만.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// 가져온 시점의 원본 판(커밋 해시 등).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    /// 원본을 변환하거나 고쳤으면 true. 가져온 규칙은 항상 true다.
    pub modified: bool,
    /// 원본이 요구하는 고지 문구(저작권 표시 등).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
}

/// 규칙 한 건.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    /// 파일 안에서 겹치지 않는 식별자. 소문자, 숫자, `.`, `_`, `-`만 쓴다.
    pub id: String,
    /// 화면에 보일 이름.
    pub name: String,
    pub kind: RuleKind,
    /// `kind`가 `runtime`일 때 어느 런타임인지. 그때만, 그리고 반드시 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<Runtime>,
    pub category: Category,
    /// 만든 곳(회사나 프로젝트).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    /// 공식 주소. `https:`만.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// 일치 조건. 하나라도 맞으면 이 규칙이 맞은 것이다. 비어 있으면 안 된다.
    #[serde(rename = "match")]
    pub matches: Vec<Match>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum RuleKind {
    Runtime,
    Library,
}

/// 일치 조건 하나.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Match {
    pub target: MatchTarget,
    #[serde(rename = "type")]
    pub match_type: MatchType,
    /// 맞춰 볼 값. 대소문자를 구별한다.
    pub value: String,
    /// 이 조건을 적용할 포장 형식. 없으면 전부.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub packaging: Vec<Packaging>,
    /// `target`이 `string-marker`일 때: 표식을 찾을 파일의 경로(리터럴 또는 글롭). 그때만, 그리고 반드시 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// `target`이 `string-marker`일 때: 이 크기보다 큰 파일에서는 찾지 않는다. 그때만, 그리고 반드시 있다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_file_bytes: Option<u64>,
}

/// 무엇에 맞춰 보는지. 근거 종류와 확신도가 여기서 정해진다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum MatchTarget {
    /// 파일 이름(경로의 마지막 마디). 예: `libflutter.so`. 확신도 중간.
    FileName,
    /// 앱 뿌리부터의 경로. 구분자는 `/`. 확신도 중간.
    Path,
    /// 프레임워크 이름(`.framework`를 뺀 것). 확신도 중간.
    FrameworkName,
    /// DEX 클래스 이름. `com/example/Foo` 형태. 확신도 중간.
    DexClass,
    /// npm 패키지 이름(`package.json`이 밝힌 이름). 확신도 높음.
    NpmPackage,
    /// 파일 안의 문자열. `file`과 `maxFileBytes`가 필요하다. 확신도 낮음.
    StringMarker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum MatchType {
    /// 전체가 같다.
    Literal,
    /// 이 값으로 시작한다. `path`와 `dex-class`에서는 값이 `/`로 끝나야 한다.
    Prefix,
    /// `*`만 쓰는 글롭. `*`는 `/`를 넘지 않는다. `*`는 두 개까지.
    Glob,
}

impl MatchTarget {
    /// 이 대상에 쓸 수 있는 일치 방식.
    pub fn allowed(self) -> &'static [MatchType] {
        use MatchType::*;
        match self {
            MatchTarget::FileName => &[Literal, Prefix, Glob],
            MatchTarget::Path => &[Literal, Prefix, Glob],
            MatchTarget::FrameworkName => &[Literal, Prefix],
            MatchTarget::DexClass => &[Literal, Prefix],
            MatchTarget::NpmPackage => &[Literal],
            MatchTarget::StringMarker => &[Literal],
        }
    }
}

/// 검증 오류 하나. `rule`은 규칙의 순번(0부터), 파일 전체의 문제면 None.
#[derive(Debug, Clone, PartialEq)]
pub struct RuleError {
    pub rule: Option<usize>,
    pub id: Option<String>,
    pub message: String,
}

fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
        && s.as_bytes()[0].is_ascii_alphanumeric()
}

fn check_glob(v: &str) -> Result<(), &'static str> {
    if v.chars().any(|c| matches!(c, '?' | '[' | ']' | '{' | '}' | '\\')) {
        return Err("a glob may use only `*`");
    }
    if v.contains("**") {
        return Err("`**` is not allowed");
    }
    let stars = v.matches('*').count();
    if stars == 0 {
        return Err("the glob has no `*`; use literal");
    }
    if stars > MAX_GLOB_STARS {
        return Err("at most two `*`");
    }
    if v.replace('*', "").len() < 3 {
        return Err("a glob needs at least 3 fixed characters");
    }
    Ok(())
}

/// 스키마로 표현하지 못하는 규칙을 검사한다. 오류가 없으면 빈 벡터.
pub fn validate(file: &RuleFile) -> Vec<RuleError> {
    let mut errs = Vec::new();
    let mut top = |m: &str| errs.push(RuleError { rule: None, id: None, message: m.to_string() });
    if file.format_version != RULES_FORMAT_VERSION {
        top("formatVersion is not a supported value");
    }
    if !valid_id(&file.source.id) {
        top("source.id has a character that is not allowed");
    }
    if file.source.license.trim().is_empty() {
        top("source.license is empty");
    }
    if let Some(u) = &file.source.url {
        if !u.starts_with("https://") {
            top("source.url must be https:");
        }
    }
    if file.source.revision.is_some() && !file.source.modified && file.source.id != "builtin" {
        // 가져온 규칙은 변환을 거치므로 modified가 true여야 한다.
        top("imported rules (with a revision) must have modified: true");
    }
    if file.rules.windows(2).any(|w| w[0].id.as_bytes() >= w[1].id.as_bytes()) {
        top("rules are not sorted by id (byte order), or an id appears twice");
    }
    let mut seen = HashSet::new();
    for (i, r) in file.rules.iter().enumerate() {
        let mut e = |m: String| errs.push(RuleError { rule: Some(i), id: Some(r.id.clone()), message: m });
        if !valid_id(&r.id) {
            e("the id has a character that is not allowed (use a-z, 0-9, `.`, `_`, `-`)".into());
        }
        if !seen.insert(r.id.as_str()) {
            e("the id appears twice".into());
        }
        if r.name.trim().is_empty() {
            e("name is empty".into());
        }
        if (r.kind == RuleKind::Runtime) != r.runtime.is_some() {
            e("the runtime field is required when kind is runtime, and not allowed otherwise".into());
        }
        if let Some(h) = &r.homepage {
            if !h.starts_with("https://") {
                e("homepage must be https:".into());
            }
        }
        if r.matches.is_empty() {
            e("match is empty".into());
        }
        let mut dup = HashSet::new();
        for (j, m) in r.matches.iter().enumerate() {
            let mut e = |msg: String| errs.push(RuleError { rule: Some(i), id: Some(r.id.clone()), message: format!("match[{j}]: {msg}") });
            if !m.target.allowed().contains(&m.match_type) {
                e(format!("target {:?} does not accept type {:?}", m.target, m.match_type));
            }
            if m.value.is_empty() || m.value.len() > 512 {
                e("value must be 1 to 512 characters".into());
            }
            if m.value.chars().any(|c| c.is_control()) {
                e("value has a control character".into());
            }
            match m.match_type {
                MatchType::Glob => {
                    if let Err(msg) = check_glob(&m.value) {
                        e(msg.into());
                    }
                }
                MatchType::Prefix => {
                    if matches!(m.target, MatchTarget::Path | MatchTarget::DexClass) && !m.value.ends_with('/') {
                        e("a path or class prefix must end with `/`".into());
                    }
                    if m.value.len() < 3 {
                        e("a prefix needs at least 3 characters".into());
                    }
                }
                MatchType::Literal => {
                    if m.value.contains('*') && m.target != MatchTarget::StringMarker {
                        e("a literal value has `*`; use glob".into());
                    }
                }
            }
            if matches!(m.target, MatchTarget::FileName | MatchTarget::FrameworkName | MatchTarget::NpmPackage) {
                let slash_ok = m.target == MatchTarget::NpmPackage && m.value.starts_with('@') && m.value.matches('/').count() == 1;
                if m.value.contains('/') && !slash_ok {
                    e("this target's value may not contain `/`".into());
                }
            }
            if matches!(m.target, MatchTarget::Path | MatchTarget::DexClass) && (m.value.starts_with('/') || m.value.contains("//") || m.value.split('/').any(|s| s == "..")) {
                e("the path starts with `/` or contains `//` or `..`".into());
            }
            let marker = m.target == MatchTarget::StringMarker;
            if marker != m.file.is_some() || marker != m.max_file_bytes.is_some() {
                e("file and maxFileBytes are required for string-marker (both), and not allowed otherwise".into());
            }
            if marker {
                if m.value.len() < 6 {
                    e("a string marker needs at least 6 characters".into());
                }
                if let Some(n) = m.max_file_bytes {
                    if n == 0 || n > MAX_MARKER_FILE_BYTES {
                        e("maxFileBytes must be between 1 byte and 64 MiB".into());
                    }
                }
                if let Some(f) = &m.file {
                    if f.contains('*') {
                        if let Err(msg) = check_glob(f) {
                            e(format!("file: {msg}"));
                        }
                    }
                }
            }
            let mut p = m.packaging.clone();
            p.dedup();
            if p.len() != m.packaging.len() {
                e("packaging lists the same value twice".into());
            }
            if !dup.insert((m.target, m.match_type, m.value.as_str(), m.file.as_deref())) {
                e("the same condition appears twice".into());
            }
        }
    }
    errs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load(name: &str) -> RuleFile {
        let text = std::fs::read_to_string(format!("{}/{}", env!("CARGO_MANIFEST_DIR"), name)).unwrap();
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn example_is_valid_and_round_trips() {
        let name = "example-rules.json";
        let text = std::fs::read_to_string(format!("{}/{}", env!("CARGO_MANIFEST_DIR"), name)).unwrap();
        let file = load(name);
        assert_eq!(validate(&file), vec![]);
        let a: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(a, serde_json::to_value(&file).unwrap());
    }

    fn rule(id: &str, m: Match) -> RuleFile {
        RuleFile {
            format_version: 1,
            source: RuleSource { id: "user".into(), name: "t".into(), license: "Apache-2.0".into(), url: None, revision: None, modified: false, notice: None },
            rules: vec![Rule { id: id.into(), name: "X".into(), kind: RuleKind::Library, runtime: None, category: Category::Other, vendor: None, homepage: None, matches: vec![m] }],
        }
    }
    fn m(target: MatchTarget, t: MatchType, v: &str) -> Match {
        Match { target, match_type: t, value: v.into(), packaging: vec![], file: None, max_file_bytes: None }
    }

    #[test]
    fn rejects_what_the_plan_forbids() {
        use MatchTarget::*;
        use MatchType::*;
        let bad = [
            rule("a", m(Path, Glob, "lib/**/x.so")),          // `**`
            rule("a", m(Path, Glob, "lib/[ab]/x.so")),        // 글롭 문법 밖
            rule("a", m(Path, Glob, "*/*/*.so")),             // `*` 세 개
            rule("a", m(FileName, Glob, "*")),                // 전부에 맞음
            rule("a", m(DexClass, Prefix, "com/google")),     // `/`로 안 끝남
            rule("a", m(NpmPackage, Prefix, "react")),        // npm에는 literal만
            rule("a", m(StringMarker, Literal, "tauri::app")), // file, maxFileBytes 없음
            rule("a", m(Path, Literal, "../etc/passwd")),     // `..`
            rule("A", m(FileName, Literal, "libx.so")),       // id에 대문자
            rule("a", m(FileName, Literal, "lib/x.so")),      // 파일 이름에 `/`
        ];
        for (i, f) in bad.iter().enumerate() {
            assert!(!validate(f).is_empty(), "bad[{i}]가 통과했다");
        }
        let good = [
            rule("a", m(FileName, Literal, "libflutter.so")),
            rule("a", m(FileName, Glob, "libhermes*.so")),
            rule("a", m(DexClass, Prefix, "com/google/ads/")),
            rule("a", m(NpmPackage, Literal, "@scope/name")),
            rule("a", Match { file: Some("Contents/MacOS/*".into()), max_file_bytes: Some(300_000_000 / 10), ..m(StringMarker, Literal, "tauri::app") }),
        ];
        for (i, f) in good.iter().enumerate() {
            assert_eq!(validate(f), vec![], "good[{i}]가 거부됐다");
        }
    }
}
