//! 규칙 색인, 파일 종류 판정, 논리 트리를 만드는 조립기.
use anatomy_schema::rules::{Match, MatchTarget, MatchType, Rule, RuleFile};
use anatomy_schema::*;
use std::collections::{BTreeMap, HashMap};

// ------------------------------------------------------------------ 규칙 색인

/// (규칙 파일 번호, 규칙 번호, 조건 번호)
type Ref = (usize, usize, usize);

#[derive(Default)]
pub struct RuleSet {
    pub files: Vec<RuleFile>,
    literal: HashMap<(MatchTarget, String), Vec<Ref>>,
    prefix: HashMap<(MatchTarget, String), Vec<Ref>>,
    /// 접두어 대상 가운데 `/` 경계로 찾을 수 없는 것(파일 이름, 프레임워크 이름)과 글롭.
    scan: Vec<(MatchTarget, MatchType, String, Ref)>,
}

pub struct Hit<'a> {
    pub rule: &'a Rule,
    pub source: &'a str,
    pub confidence: Confidence,
    pub evidence: Evidence,
}

/// `*`만 쓰는 글롭. `*`는 `/`를 넘지 않는다.
pub fn glob_match(pat: &str, s: &str) -> bool {
    match pat.find('*') {
        None => pat == s,
        Some(i) => {
            let (head, rest) = (&pat[..i], &pat[i + 1..]);
            let Some(tail) = s.strip_prefix(head) else { return false };
            // `*`가 먹을 수 있는 길이를 하나씩 늘려 본다
            let mut k = 0;
            loop {
                if glob_match(rest, &tail[k..]) {
                    return true;
                }
                match tail[k..].chars().next() {
                    Some(c) if c != '/' => k += c.len_utf8(),
                    _ => return false,
                }
            }
        }
    }
}

impl RuleSet {
    pub fn add(&mut self, file: RuleFile) {
        let fi = self.files.len();
        for (ri, r) in file.rules.iter().enumerate() {
            for (mi, m) in r.matches.iter().enumerate() {
                let key = (m.target, m.value.clone());
                match (m.match_type, m.target) {
                    (_, MatchTarget::StringMarker) => {} // 문자열 표식은 아직 적용하지 않는다
                    (MatchType::Literal, _) => self.literal.entry(key).or_default().push((fi, ri, mi)),
                    (MatchType::Prefix, MatchTarget::Path | MatchTarget::DexClass) => self.prefix.entry(key).or_default().push((fi, ri, mi)),
                    (t, target) => self.scan.push((target, t, m.value.clone(), (fi, ri, mi))),
                }
            }
        }
        self.files.push(file);
    }

    pub fn version(&self) -> String {
        let mut v: Vec<String> = self.files.iter().map(|f| match &f.source.revision {
            Some(r) => format!("{}@{}", f.source.id, &r[..r.len().min(12)]),
            None => format!("{}:{}", f.source.id, f.rules.len()),
        }).collect();
        v.sort();
        if v.is_empty() { "none".into() } else { v.join("+") }
    }

    fn m(&self, r: Ref) -> &Match {
        &self.files[r.0].rules[r.1].matches[r.2]
    }

    fn pick(&self, refs: &[Ref], packaging: Packaging) -> Option<Ref> {
        // 같은 조건에 여러 규칙이 걸리면 규칙 식별자 순 (계획 9.2)
        refs.iter().copied().filter(|&r| self.m(r).packaging.is_empty() || self.m(r).packaging.contains(&packaging))
            .min_by(|a, b| self.files[a.0].rules[a.1].id.cmp(&self.files[b.0].rules[b.1].id))
    }

    /// 대상 하나에 대해 가장 잘 맞는 규칙을 찾는다. 정확 일치 > 가장 긴 접두어 > 글롭.
    pub fn lookup(&self, target: MatchTarget, key: &str, packaging: Packaging) -> Option<Hit<'_>> {
        let mut found: Option<(Ref, &str)> = None;
        if let Some(r) = self.literal.get(&(target, key.to_string())).and_then(|v| self.pick(v, packaging)) {
            found = Some((r, key));
        }
        if found.is_none() && matches!(target, MatchTarget::Path | MatchTarget::DexClass) && !self.prefix.is_empty() {
            let cuts: Vec<usize> = key.bytes().enumerate().filter(|(_, b)| *b == b'/').map(|(i, _)| i + 1).collect();
            for &c in cuts.iter().rev() {
                if let Some(r) = self.prefix.get(&(target, key[..c].to_string())).and_then(|v| self.pick(v, packaging)) {
                    found = Some((r, &key[..c]));
                    break;
                }
            }
        }
        if found.is_none() {
            let mut best: Option<(usize, Ref)> = None;
            for (t, mt, value, r) in &self.scan {
                if *t != target {
                    continue;
                }
                let ok = match mt {
                    MatchType::Prefix => key.starts_with(value.as_str()),
                    MatchType::Glob => glob_match(value, key),
                    MatchType::Literal => false,
                };
                let pk = &self.m(*r).packaging;
                if ok && (pk.is_empty() || pk.contains(&packaging)) && best.map_or(true, |(n, _)| value.len() > n) {
                    best = Some((value.len(), *r));
                }
            }
            if let Some((_, r)) = best {
                found = Some((r, key));
            }
        }
        let (r, detail) = found?;
        let file = &self.files[r.0];
        let (kind, confidence) = match target {
            MatchTarget::NpmPackage => (EvidenceKind::Metadata, Confidence::High),
            MatchTarget::DexClass => (EvidenceKind::Prefix, Confidence::Medium),
            MatchTarget::StringMarker => (EvidenceKind::StringMarker, Confidence::Low),
            _ => (EvidenceKind::Path, Confidence::Medium),
        };
        Some(Hit { rule: &file.rules[r.1], source: &file.source.id, confidence, evidence: Evidence { kind, detail: detail.to_string() } })
    }
}

// ------------------------------------------------------------------ 파일 종류

pub fn file_kind(path: &str) -> FileKind {
    let name = path.rsplit('/').next().unwrap_or(path);
    if path.contains(".lproj/") {
        return FileKind::Localization;
    }
    let ext = match name.rfind('.') {
        Some(i) if i > 0 => name[i + 1..].to_ascii_lowercase(),
        _ => return FileKind::Other,
    };
    match ext.as_str() {
        "so" | "dylib" | "node" | "dex" | "dll" | "exe" => FileKind::Executable,
        "js" | "mjs" | "cjs" | "jsbundle" | "bundle" | "ts" | "py" | "sh" | "lua" => FileKind::Script,
        "map" => FileKind::Sourcemap,
        "wasm" => FileKind::Wasm,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "icns" | "ico" | "car" | "avif" | "heic" | "bmp" | "tiff" | "pdf" => FileKind::Image,
        "ttf" | "otf" | "woff" | "woff2" | "ttc" => FileKind::Font,
        "mp3" | "mp4" | "wav" | "caf" | "ogg" | "m4a" | "mov" | "webm" | "aac" | "flac" | "aiff" => FileKind::Media,
        "strings" | "stringsdict" | "arsc" | "mo" | "po" | "lproj" => FileKind::Localization,
        "json" | "xml" | "plist" | "db" | "sqlite" | "txt" | "md" | "yaml" | "yml" | "bin" | "dat" | "pak" | "html" | "css" | "nib" | "proto" | "properties" | "toml" | "csv" => FileKind::Data,
        _ => FileKind::Other,
    }
}

/// 파일 종류만으로 에셋이라고 볼 수 있는가 (계획 9.1의 2번).
pub fn is_asset_kind(k: FileKind) -> bool {
    matches!(k, FileKind::Image | FileKind::Font | FileKind::Media | FileKind::Localization)
}

// ------------------------------------------------------------------ 조립기

#[derive(Default)]
pub struct Attr {
    pub origin: Option<Origin>,
    pub confidence: Option<Confidence>,
    pub evidence: Option<Evidence>,
    pub category: Option<Category>,
    pub rule_id: Option<String>,
    pub rule_source: Option<String>,
    pub file_kind: Option<FileKind>,
    pub container_type: Option<ContainerType>,
    pub no_module_layer: bool,
}

impl Attr {
    pub fn origin(o: Origin, c: Confidence, kind: EvidenceKind, detail: &str) -> Attr {
        Attr { origin: Some(o), confidence: Some(c), evidence: Some(Evidence { kind, detail: detail.to_string() }), ..Default::default() }
    }
    pub fn hit(h: &Hit<'_>, origin: Origin) -> Attr {
        Attr { origin: Some(origin), confidence: Some(h.confidence), evidence: Some(h.evidence.clone()), category: Some(h.rule.category),
               rule_id: Some(h.rule.id.clone()), rule_source: Some(h.source.to_string()), ..Default::default() }
    }
    pub fn container(t: ContainerType) -> Attr {
        Attr { container_type: Some(t), ..Default::default() }
    }
    pub fn lump(mut self) -> Attr {
        self.no_module_layer = true;
        self
    }
    pub fn kind(mut self, k: FileKind) -> Attr {
        self.file_kind = Some(k);
        self
    }
}

pub struct B {
    pub kind: NodeKind,
    pub name: String,
    /// 잎에 직접 더한 바이트. 자식이 있으면 끝에서 자식의 합으로 바뀐다.
    pub own: u64,
    pub compressed: u64,
    pub attr: Attr,
    pub paths: Vec<String>,
    pub encrypted: bool,
    pub short_name_ratio: Option<f64>,
    pub link: Option<LinkInfo>,
    pub failure: Option<ParseFailure>,
    /// 자식의 출처 가운데 바이트가 가장 큰 것으로 출처를 정한다.
    pub derive_origin: bool,
    pub kids: BTreeMap<String, usize>,
}

pub struct Tree {
    pub n: Vec<B>,
}

impl Tree {
    pub fn new(app_name: &str) -> Tree {
        let mut t = Tree { n: Vec::new() };
        t.push(NodeKind::App, app_name, Attr::default());
        t
    }
    fn push(&mut self, kind: NodeKind, name: &str, attr: Attr) -> usize {
        self.n.push(B { kind, name: name.to_string(), own: 0, compressed: 0, attr, paths: Vec::new(), encrypted: false, short_name_ratio: None, link: None, failure: None, derive_origin: false, kids: BTreeMap::new() });
        self.n.len() - 1
    }
    /// 부모 아래의 이름으로 노드를 찾거나 만든다. 이미 있으면 속성은 바꾸지 않는다.
    pub fn node(&mut self, parent: usize, kind: NodeKind, name: &str, attr: impl FnOnce() -> Attr) -> usize {
        if let Some(&id) = self.n[parent].kids.get(name) {
            return id;
        }
        let id = self.push(kind, name, attr());
        self.n[parent].kids.insert(name.to_string(), id);
        id
    }
    /// 잎을 만들고 바이트를 더한다. 같은 이름이 이미 있으면 거기에 더한다.
    pub fn leaf(&mut self, parent: usize, kind: NodeKind, name: &str, bytes: u64, compressed: u64, attr: impl FnOnce() -> Attr) -> usize {
        let id = self.node(parent, kind, name, attr);
        self.n[id].own += bytes;
        self.n[id].compressed += compressed;
        id
    }
    pub fn len(&self) -> usize {
        self.n.len()
    }

    /// 조립기의 마지막 단계: 합계를 올리고 스키마의 노드로 바꾼다. 바이트를 세는 유일한 곳.
    pub fn finish(&self, id: usize) -> Node {
        let b = &self.n[id];
        let mut children: Vec<Node> = b.kids.values().map(|&k| self.finish(k)).collect();
        // 자식이 있는 노드가 직접 받은 바이트는 잃지 않도록 따로 잎을 만든다
        if !children.is_empty() && b.own > 0 {
            children.push(Node { kind: NodeKind::Overhead, name: "(unattributed)".into(), bytes: b.own, ..empty_node() });
            children.sort_by(|a, c| a.name.as_bytes().cmp(c.name.as_bytes()));
        }
        let leaf = children.is_empty();
        let bytes = if leaf { b.own } else { children.iter().map(|c| c.bytes).sum() };
        let a = &b.attr;
        let mut origin = a.origin;
        if b.derive_origin && !leaf {
            let mut by: Vec<(Origin, u64)> = Vec::new();
            for c in &children {
                if let Some(o) = c.origin {
                    match by.iter_mut().find(|(x, _)| *x == o) {
                        Some(e) => e.1 += c.bytes,
                        None => by.push((o, c.bytes)),
                    }
                }
            }
            origin = by.into_iter().max_by_key(|(_, n)| *n).map(|(o, _)| o).or(origin);
        }
        let has_origin = !matches!(b.kind, NodeKind::Container | NodeKind::Overhead | NodeKind::Shared | NodeKind::Link | NodeKind::ParseFailed);
        Node {
            kind: b.kind,
            name: b.name.clone(),
            bytes,
            compressed_bytes: if leaf && b.compressed > 0 { Some(b.compressed) } else { None },
            origin: if has_origin { origin } else { None },
            confidence: if has_origin && origin.is_some() { a.confidence.or(Some(Confidence::Low)) } else { None },
            evidence: if has_origin { a.evidence.clone() } else { None },
            category: a.category,
            rule_id: a.rule_id.clone(),
            rule_source: a.rule_source.clone(),
            paths: b.paths.clone(),
            file_kind: if leaf && has_origin { a.file_kind } else { None },
            container_type: if b.kind == NodeKind::Container { a.container_type.or(Some(ContainerType::Opaque)) } else { None },
            encrypted: b.encrypted,
            no_module_layer: a.no_module_layer && leaf,
            short_name_ratio: b.short_name_ratio,
            link: b.link.clone(),
            failure: b.failure.clone(),
            children,
        }
    }
}

pub fn empty_node() -> Node {
    Node { kind: NodeKind::Overhead, name: String::new(), bytes: 0, compressed_bytes: None, origin: None, confidence: None, evidence: None, category: None, rule_id: None, rule_source: None,
           paths: Vec::new(), file_kind: None, container_type: None, encrypted: false, no_module_layer: false, short_name_ratio: None, link: None, failure: None, children: Vec::new() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob() {
        assert!(glob_match("libhermes*.so", "libhermesvm.so"));
        assert!(glob_match("libhermes*.so", "libhermes.so"));
        assert!(glob_match("libcronet.*.so", "libcronet.143.0.7445.0.so"));
        assert!(!glob_match("lib/*.so", "lib/arm64/x.so"));
        assert!(glob_match("lib/*/x.so", "lib/arm64/x.so"));
        assert!(!glob_match("libhermes*.so", "libhermes.so.bak"));
    }

    #[test]
    fn kinds() {
        assert_eq!(file_kind("a/b/app.js.map"), FileKind::Sourcemap);
        assert_eq!(file_kind("en.lproj/Main.nib"), FileKind::Localization);
        assert_eq!(file_kind("Contents/MacOS/App"), FileKind::Other);
    }
}
