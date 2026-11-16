//! 포장 해부기와 런타임 해부기. 물리 항목을 논리 트리에 놓는다.
use crate::host::{progress, STAGE_RUNTIME};
use crate::parsers::{asar_data_base, asar_files, asar_json_len, dex_classes, elf_dynamic, elf_needed, elf_vaddr_to_off, macho, macho_dylibs, npm_deps};
use crate::phys::{link_target, read_prefix, read_ranges, Phys};
use crate::tree::{file_kind, is_asset_kind, Attr, RuleSet, Tree};
use anatomy_schema::rules::{MatchTarget, RuleKind};
use anatomy_schema::*;
use std::collections::HashSet;

const APP: usize = 0;
const MAX_DEX: u64 = 64 * 1024 * 1024;
/// Android에서 Compose를 감지로 보는 클래스 수. 임시값이다(정하지 않은 기준).
const COMPOSE_MIN_CLASSES: usize = 100;
const RN_JAVA: [&str; 6] = ["com/facebook/react/", "com/facebook/hermes/", "com/facebook/jni/", "com/facebook/soloader/", "com/facebook/yoga/", "com/facebook/fbreact/"];

pub struct RtInfo {
    pub runtime: Runtime,
    pub node: Option<usize>,
    pub dissected: bool,
    pub confidence: Confidence,
    pub evidence: Evidence,
    pub version: Option<String>,
}

#[derive(Default)]
pub struct AppInfo {
    pub name: String,
    pub app_id: Option<String>,
    pub version: Option<String>,
    pub executable: Option<String>,
}

pub struct Ctx<'a> {
    pub t: Tree,
    pub rules: &'a RuleSet,
    pub pk: Packaging,
    pub warnings: Vec<Warning>,
    pub runtimes: Vec<RtInfo>,
}

fn rt_name(r: Runtime) -> &'static str {
    match r {
        Runtime::Electron => "Electron",
        Runtime::Flutter => "Flutter",
        Runtime::ReactNative => "React Native",
        _ => "Runtime",
    }
}

fn ev(kind: EvidenceKind, detail: &str) -> Evidence {
    Evidence { kind, detail: detail.to_string() }
}

impl<'a> Ctx<'a> {
    pub fn new(name: &str, rules: &'a RuleSet, pk: Packaging) -> Ctx<'a> {
        Ctx { t: Tree::new(name), rules, pk, warnings: Vec::new(), runtimes: Vec::new() }
    }

    fn detect(&mut self, runtime: Runtime, confidence: Confidence, detail: &str) -> usize {
        if let Some(r) = self.runtimes.iter().find(|r| r.runtime == runtime) {
            return r.node.unwrap_or(APP);
        }
        let node = self.t.node(APP, NodeKind::Runtime, rt_name(runtime), || Attr::origin(Origin::Runtime, confidence, EvidenceKind::Path, detail));
        self.runtimes.push(RtInfo { runtime, node: Some(node), dissected: true, confidence, evidence: ev(EvidenceKind::Path, detail), version: None });
        progress(STAGE_RUNTIME, rt_name(runtime));
        node
    }
    fn rt(&self, runtime: Runtime) -> Option<usize> {
        self.runtimes.iter().find(|r| r.runtime == runtime).and_then(|r| r.node)
    }

    fn overhead(&mut self, parent: usize, bytes: u64) {
        if bytes > 0 {
            self.t.leaf(parent, NodeKind::Overhead, "(overhead)", bytes, 0, Attr::default);
        }
    }

    fn warn(&mut self, code: &str, message: String, path: &str) {
        self.warnings.push(Warning { code: code.into(), message, path: Some(path.to_string()) });
    }

    fn failed(&mut self, parent: usize, name: &str, p: &Phys, parser: &str) {
        let id = self.t.leaf(parent, NodeKind::ParseFailed, name, p.size, p.csize, Attr::default);
        self.t.n[id].failure = Some(ParseFailure { parser: parser.into(), code: "E_CORRUPT_INPUT".into(), offset: None });
        self.t.n[id].paths = vec![p.path.clone()];
        self.warn("W_PARSE_FAILED", format!("{name} could not be parsed by the {parser} parser; it is counted as one block."), &p.path);
    }

    /// 파일 하나의 출처를 규칙 없이 정한다: 에셋이면 에셋, 아니면 미식별.
    fn plain(path: &str, forced: Option<Origin>) -> Attr {
        let k = file_kind(path);
        let a = match forced {
            Some(o) => Attr::origin(o, Confidence::Medium, EvidenceKind::Location, "inside an owned bundle"),
            None if is_asset_kind(k) => Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::FileType, path.rsplit('.').next().unwrap_or("")),
            None => Attr::origin(Origin::Unidentified, Confidence::Low, EvidenceKind::Default, "no rule matched"),
        };
        a.kind(k)
    }

    /// 어느 해부기도 소유하지 않은 파일. 규칙에 맞으면 그 라이브러리로, 아니면 첫 폴더 이름으로 묶는다.
    fn generic(&mut self, parent: usize, rel: &str, full: &str, p: &Phys, forced: Option<Origin>) {
        let base = full.rsplit('/').next().unwrap_or(full);
        let hit = self.rules.lookup(MatchTarget::Path, full, self.pk).or_else(|| self.rules.lookup(MatchTarget::FileName, base, self.pk));
        if let Some(h) = hit {
            let origin = if h.rule.kind == RuleKind::Runtime { Origin::Runtime } else { Origin::Library };
            let name = h.rule.name.clone();
            let lib = self.t.node(parent, NodeKind::Library, &name, || Attr::hit(&h, origin));
            let conf = h.confidence;
            self.t.leaf(lib, NodeKind::Module, rel, p.size, p.csize, || Attr { origin: Some(origin), confidence: Some(conf), file_kind: Some(file_kind(full)), ..Default::default() });
            return;
        }
        match rel.split_once('/') {
            None => {
                self.t.leaf(parent, NodeKind::Library, rel, p.size, p.csize, || Self::plain(full, forced));
            }
            Some((group, rest)) => {
                let lib = self.t.node(parent, NodeKind::Library, group, || Self::plain(full, forced));
                self.t.n[lib].derive_origin = forced.is_none();
                self.t.leaf(lib, NodeKind::Module, rest, p.size, p.csize, || Self::plain(full, forced));
            }
        }
    }

    /// 실행 파일. 유니버설이면 아키텍처 조각으로 나눈다. iOS면 암호화 여부를 읽는다.
    fn executable(&mut self, parent: usize, name: &str, p: &Phys, attr: Attr) -> usize {
        let m = macho(&read_prefix(p, 64 * 1024), p.size);
        match m {
            Some(m) if m.slices.len() > 1 => {
                let origin = attr.origin;
                let conf = attr.confidence;
                let lib = self.t.node(parent, NodeKind::Library, name, || attr);
                self.t.n[lib].paths = vec![p.path.clone()];
                for (arch, size) in &m.slices {
                    let c = self.t.node(lib, NodeKind::Container, arch, || Attr::container(ContainerType::Arch));
                    self.t.leaf(c, NodeKind::Module, "(code)", *size, 0, || Attr { origin, confidence: conf, file_kind: Some(FileKind::Executable), no_module_layer: true, ..Default::default() });
                }
                self.overhead(lib, m.overhead);
                lib
            }
            other => {
                let id = self.t.leaf(parent, NodeKind::Library, name, p.size, p.csize, || attr.kind(FileKind::Executable).lump());
                self.t.n[id].paths = vec![p.path.clone()];
                self.t.n[id].encrypted = other.map_or(false, |m| m.encrypted);
                id
            }
        }
    }

    /// asar 안의 파일 하나(또는 asar.unpacked의 같은 경로)를 패키지 노드에 놓는다.
    fn asar_file(&mut self, container: usize, rel: &str, size: u64, csize: u64) {
        let kind = file_kind(rel);
        if let Some(i) = rel.find("node_modules/").filter(|&i| i == 0 || rel.as_bytes()[i - 1] == b'/') {
            let after = &rel[i + 13..];
            let mut segs = after.splitn(3, '/');
            let first = segs.next().unwrap_or("");
            let (pkg, rest) = if first.starts_with('@') {
                let second = segs.next().unwrap_or("");
                (format!("{first}/{second}"), segs.next().unwrap_or("").to_string())
            } else {
                (first.to_string(), after[first.len()..].trim_start_matches('/').to_string())
            };
            if !pkg.is_empty() && !rest.is_empty() {
                let hit = self.rules.lookup(MatchTarget::NpmPackage, &pkg, self.pk);
                let detail = format!("node_modules/{pkg}");
                let lib = self.t.node(container, NodeKind::Library, &pkg, || match &hit {
                    Some(h) => Attr::hit(h, Origin::Library),
                    None => Attr::origin(Origin::Library, Confidence::High, EvidenceKind::Metadata, &detail),
                });
                let name = if i == 0 { rest } else { format!("{}:{}", &rel[..i - 1], rest) };
                self.t.leaf(lib, NodeKind::Module, &name, size, csize, || Attr { origin: Some(Origin::Library), confidence: Some(Confidence::High), file_kind: Some(kind), ..Default::default() });
                return;
            }
        }
        let lib = self.t.node(container, NodeKind::Library, "(app)", || Attr::origin(Origin::BundledAppCode, Confidence::High, EvidenceKind::Location, "outside node_modules"));
        let origin = match kind {
            FileKind::Script => Origin::BundledAppCode,
            k if is_asset_kind(k) => Origin::Asset,
            _ => Origin::AppCode,
        };
        self.t.leaf(lib, NodeKind::Module, rel, size, csize, || Attr { origin: Some(origin), confidence: Some(Confidence::High), file_kind: Some(kind), ..Default::default() });
    }

    fn asar(&mut self, parent: usize, name: &str, p: &Phys) {
        let files = asar_json_len(&read_prefix(p, 16)).and_then(|n| {
            let buf = read_prefix(p, 16 + n);
            asar_files(buf.get(16..16 + n)?)
        });
        let Some(files) = files else { return self.failed(parent, name, p, "asar") };
        let packed: u64 = files.iter().filter(|f| !f.unpacked).map(|f| f.size).sum();
        if packed > p.size {
            return self.failed(parent, name, p, "asar");
        }
        let c = self.t.node(parent, NodeKind::Container, name, || Attr::container(ContainerType::ParsedFile));
        self.t.n[c].paths.push(p.path.clone());
        for f in files.iter().filter(|f| !f.unpacked) {
            self.asar_file(c, &f.path, f.size, 0);
        }
        self.overhead(c, p.size - packed);
        self.asar_deps(c, p, &files);
    }

    /// asar 안의 package.json에 적힌 `dependencies`로 패키지 사이의 의존을 적는다.
    /// 맨 위의 package.json은 앱 자체 코드("(app)")의 것이고, node_modules/<패키지>/package.json은 그 패키지의 것이다.
    /// 같은 asar 안에 노드가 있는 패키지만 잇는다.
    fn asar_deps(&mut self, container: usize, p: &Phys, files: &[crate::parsers::AsarFile]) {
        const MAX_PKG_JSON: u64 = 512 * 1024;
        let Some(base) = asar_data_base(&read_prefix(p, 16)) else { return };
        let mut who: Vec<String> = Vec::new();
        let mut ranges: Vec<(u64, usize)> = Vec::new();
        for f in files.iter().filter(|f| !f.unpacked && f.size > 0 && f.size <= MAX_PKG_JSON) {
            let Some(off) = f.offset else { continue };
            let owner = if f.path == "package.json" {
                Some("(app)".to_string())
            } else {
                f.path.strip_prefix("node_modules/").and_then(|r| r.strip_suffix("/package.json")).filter(|pkg| {
                    let segs = pkg.split('/').count();
                    if pkg.starts_with('@') { segs == 2 } else { segs == 1 }
                }).map(|s| s.to_string())
            };
            if let Some(o) = owner {
                if who.len() < 5000 {
                    who.push(o);
                    ranges.push((base + off, f.size as usize));
                }
            }
        }
        let bodies = read_ranges(p, &ranges);
        for (owner, body) in who.iter().zip(bodies) {
            let Some(&from) = self.t.n[container].kids.get(owner.as_str()) else { continue };
            for dep in npm_deps(&body) {
                if let Some(&to) = self.t.n[container].kids.get(dep.as_str()) {
                    self.t.need(from, to);
                }
            }
        }
    }

    /// ELF 파일이 필요하다고 적은 라이브러리 이름들 (DT_NEEDED).
    fn elf_needs(p: &Phys) -> Vec<String> {
        const MAX_SO: u64 = 200 * 1024 * 1024;
        if p.size > MAX_SO {
            return Vec::new();
        }
        let head = read_prefix(p, 64 * 1024);
        let Some(d) = elf_dynamic(&head) else { return Vec::new() };
        let dynb = read_ranges(p, &[(d.dyn_off, d.dyn_size.min(64 * 1024) as usize)]).pop().unwrap_or_default();
        let (needed, strtab, strsz) = elf_needed(&dynb, d.is64);
        let (Some(st), Some(sz)) = (strtab.and_then(|v| elf_vaddr_to_off(&d, v)), strsz) else { return Vec::new() };
        if needed.is_empty() || sz > 16 * 1024 * 1024 {
            return Vec::new();
        }
        let tab = read_ranges(p, &[(st, sz as usize)]).pop().unwrap_or_default();
        needed.iter().filter_map(|&o| {
            let s = tab.get(o as usize..)?;
            let end = s.iter().position(|&b| b == 0)?;
            std::str::from_utf8(&s[..end]).ok().filter(|n| !n.is_empty()).map(|n| n.to_string())
        }).collect()
    }

    fn link(&mut self, p: &Phys, rel: &str) {
        let id = self.t.node(APP, NodeKind::Link, rel, Attr::default);
        let target = link_target(p).unwrap_or_default();
        let external = target.starts_with('/') || {
            // 상대 경로가 앱 밖으로 나가는지: 링크가 놓인 깊이보다 `..`이 많으면 밖이다
            let depth = rel.matches('/').count() as i64;
            let mut d = depth;
            let mut out = false;
            for seg in target.split('/') {
                if seg == ".." { d -= 1 } else if !seg.is_empty() && seg != "." { d += 1 }
                if d < 0 { out = true }
            }
            out
        };
        self.t.n[id].link = Some(LinkInfo { target, external });
    }
}

// ------------------------------------------------------------------ macOS 앱과 iOS 앱

pub fn dissect_apple(c: &mut Ctx, files: &[Phys], rels: &[String], ios: bool, info: &AppInfo) {
    let base = if ios { "" } else { "Contents/" };
    let fw_prefix = format!("{base}Frameworks/");
    let tops: HashSet<&str> = rels.iter().filter_map(|r| r.strip_prefix(&fw_prefix)).filter_map(|r| r.split('/').next()).collect();
    let has = |p: &str| rels.iter().any(|r| r == p);
    let has_asar = !ios && rels.iter().any(|r| r.starts_with("Contents/Resources/") && r.ends_with(".asar") && r.matches('/').count() == 2);

    // 런타임 감지 (고정 우선순위: Electron, Flutter, React Native)
    let mut engine: Option<String> = None;
    if tops.contains("Electron Framework.framework") {
        engine = Some("Electron Framework.framework".into());
        c.detect(Runtime::Electron, Confidence::High, "Contents/Frameworks/Electron Framework.framework");
    } else if has_asar {
        // 이름을 바꾼 엔진: 프레임워크 안에 icudtl.dat가 있다
        if let Some(top) = rels.iter().filter(|r| r.ends_with("/icudtl.dat")).filter_map(|r| r.strip_prefix(&fw_prefix)).filter_map(|r| r.split('/').next()).find(|t| t.ends_with(".framework")) {
            engine = Some(top.to_string());
            c.detect(Runtime::Electron, Confidence::Medium, &format!("Contents/Frameworks/{top} (icudtl.dat) + app.asar"));
        }
    }
    for f in ["FlutterMacOS.framework", "Flutter.framework"] {
        if tops.contains(f) {
            c.detect(Runtime::Flutter, Confidence::High, &format!("{fw_prefix}{f}"));
        }
    }
    let hermes = tops.iter().find(|t| t.to_ascii_lowercase().starts_with("hermes") && t.ends_with(".framework")).map(|s| s.to_string());
    if let Some(h) = &hermes {
        c.detect(Runtime::ReactNative, Confidence::High, &format!("{fw_prefix}{h}"));
    } else if ios && has("main.jsbundle") {
        c.detect(Runtime::ReactNative, Confidence::Medium, "main.jsbundle");
    }
    let electron = c.rt(Runtime::Electron);
    let flutter = c.rt(Runtime::Flutter);
    let rn = c.rt(Runtime::ReactNative);
    let exe_name = info.executable.clone().unwrap_or_default();
    // 의존을 읽을 실행 파일들: (노드, 파일)
    let mut bins: Vec<(usize, &Phys)> = Vec::new();

    for (p, rel) in files.iter().zip(rels) {
        if p.link {
            c.link(p, rel);
            continue;
        }
        let Some(r) = rel.strip_prefix(base) else {
            c.generic(APP, rel, rel, p, None);
            continue;
        };
        if r.starts_with("_CodeSignature/") || r == "CodeResources" || r == "embedded.mobileprovision" || r == "embedded.provisionprofile" {
            c.overhead(APP, p.size);
            continue;
        }
        if let Some(fr) = r.strip_prefix("Frameworks/") {
            let (top, rest) = fr.split_once('/').unwrap_or((fr, ""));
            if rest.is_empty() {
                // 프레임워크 폴더 바로 아래의 파일 (dylib 등)
                let hit = c.rules.lookup(MatchTarget::FileName, top, c.pk);
                let id = c.t.leaf(APP, NodeKind::Library, top, p.size, p.csize, || match &hit {
                    Some(h) => Attr::hit(h, Origin::Library).kind(FileKind::Executable),
                    None => Ctx::plain(rel, None),
                });
                if top.ends_with(".dylib") {
                    bins.push((id, p));
                }
            } else if engine.as_deref() == Some(top) {
                let name = top.trim_end_matches(".framework").to_string();
                c.t.leaf(electron.unwrap_or(APP), NodeKind::Library, &name, p.size, p.csize, || Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Path, &format!("{fw_prefix}{top}")).kind(FileKind::Executable).lump());
            } else if flutter.is_some() && (top == "FlutterMacOS.framework" || top == "Flutter.framework") {
                c.t.leaf(flutter.unwrap(), NodeKind::Library, top.trim_end_matches(".framework"), p.size, p.csize, || Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Path, &format!("{fw_prefix}{top}")).kind(FileKind::Executable).lump());
            } else if hermes.as_deref() == Some(top) {
                c.t.leaf(rn.unwrap(), NodeKind::Library, top.trim_end_matches(".framework"), p.size, p.csize, || Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Path, &format!("{fw_prefix}{top}")).kind(FileKind::Executable).lump());
            } else if flutter.is_some() && top == "App.framework" {
                let f = flutter.unwrap();
                if let Some(i) = rest.find("flutter_assets/") {
                    let lib = c.t.node(f, NodeKind::Library, "flutter_assets", || Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::Path, "App.framework/flutter_assets"));
                    let m = &rest[i + 15..];
                    c.t.leaf(lib, NodeKind::Module, m, p.size, p.csize, || Attr { origin: Some(Origin::Asset), confidence: Some(Confidence::Medium), file_kind: Some(file_kind(m)), ..Default::default() });
                } else if rest == "App" || rest.ends_with("/App") {
                    let id = c.t.leaf(f, NodeKind::Library, "App (snapshot)", p.size, p.csize, || Attr::origin(Origin::BundledAppCode, Confidence::High, EvidenceKind::Path, "App.framework/App").kind(FileKind::Executable).lump());
                    bins.push((id, p));
                } else if rest.contains("_CodeSignature/") {
                    c.overhead(f, p.size);
                } else {
                    c.t.leaf(f, NodeKind::Library, "App.framework (metadata)", p.size, p.csize, || Attr::origin(Origin::Runtime, Confidence::Medium, EvidenceKind::Path, "App.framework").kind(FileKind::Data));
                }
            } else if top.ends_with(".app") {
                // 중첩 앱. Electron의 Helper는 런타임이 소유한다.
                let helper = electron.is_some() && top.contains("Helper");
                let parent = if helper { electron.unwrap() } else { APP };
                let cn = c.t.node(parent, NodeKind::Container, top, || Attr::container(ContainerType::NestedApp));
                if rest.contains("_CodeSignature/") {
                    c.overhead(cn, p.size);
                } else if helper {
                    c.t.leaf(cn, NodeKind::Library, rest, p.size, p.csize, || Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Location, "Electron helper app").kind(file_kind(rest)));
                } else {
                    c.generic(cn, rest, rel, p, None);
                }
            } else if let Some(fwname) = top.strip_suffix(".framework") {
                let hit = c.rules.lookup(MatchTarget::FrameworkName, fwname, c.pk);
                let detail = format!("{fw_prefix}{top}");
                let (origin, conf) = match &hit {
                    Some(h) => (if h.rule.kind == RuleKind::Runtime { Origin::Runtime } else { Origin::Library }, h.confidence),
                    // 이름이 드러난 단위 (일반 구조 규칙)
                    None => (Origin::Library, Confidence::Medium),
                };
                let lib = c.t.node(APP, NodeKind::Library, fwname, || match &hit {
                    Some(h) => Attr::hit(h, origin),
                    None => Attr::origin(origin, conf, EvidenceKind::Path, &detail),
                });
                if rest.contains("_CodeSignature/") {
                    c.overhead(lib, p.size);
                    continue;
                }
                let m = rest.strip_prefix("Versions/A/").unwrap_or(rest);
                let k = if m == fwname { FileKind::Executable } else { file_kind(m) };
                c.t.leaf(lib, NodeKind::Module, m, p.size, p.csize, || Attr { origin: Some(origin), confidence: Some(conf), file_kind: Some(k), ..Default::default() });
                if m == fwname {
                    bins.push((lib, p));
                }
            } else {
                c.generic(APP, fr, rel, p, None);
            }
            continue;
        }
        if let Some(pr) = r.strip_prefix("PlugIns/") {
            let (top, rest) = pr.split_once('/').unwrap_or((pr, ""));
            if rest.is_empty() {
                c.generic(APP, pr, rel, p, None);
                continue;
            }
            let cn = c.t.node(APP, NodeKind::Container, top, || Attr::container(ContainerType::NestedApp));
            let stem = top.rsplit_once('.').map_or(top, |x| x.0);
            if rest.contains("_CodeSignature/") || rest == "embedded.mobileprovision" {
                c.overhead(cn, p.size);
            } else if rest == stem || rest == format!("Contents/MacOS/{stem}") {
                c.executable(cn, stem, p, Attr::origin(Origin::BundledAppCode, Confidence::Medium, EvidenceKind::Location, "app extension executable"));
            } else {
                c.generic(cn, rest, rel, p, None);
            }
            continue;
        }
        let main = if ios { r == exe_name } else { r.strip_prefix("MacOS/") == Some(exe_name.as_str()) };
        if main && !exe_name.is_empty() {
            let id = if let Some(e) = electron {
                c.executable(e, &format!("{exe_name} (launcher)"), p, Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Location, "Electron launcher executable"))
            } else {
                c.executable(APP, &exe_name, p, Attr::origin(Origin::BundledAppCode, Confidence::Medium, EvidenceKind::Location, "main executable"))
            };
            bins.push((id, p));
            continue;
        }
        if let Some(e) = electron {
            if let Some(rr) = r.strip_prefix("Resources/") {
                if rr.ends_with(".asar") && !rr.contains('/') {
                    c.asar(e, rr, p);
                    continue;
                }
                if let Some(i) = rr.find(".asar.unpacked/").filter(|&i| !rr[..i].contains('/')) {
                    let cn = c.t.node(e, NodeKind::Container, &rr[..i + 5], || Attr::container(ContainerType::ParsedFile));
                    c.asar_file(cn, &rr[i + 15..], p.size, p.csize);
                    continue;
                }
            }
        }
        if ios && r == "main.jsbundle" {
            if let Some(n) = rn {
                c.t.leaf(n, NodeKind::Library, "main.jsbundle", p.size, p.csize, || Attr::origin(Origin::BundledAppCode, Confidence::High, EvidenceKind::Path, "main.jsbundle").kind(FileKind::Script).lump());
                continue;
            }
        }
        // 나머지: Resources/<이름>, MacOS의 보조 실행 파일, 뿌리의 파일
        let shown = r.strip_prefix("Resources/").unwrap_or(r);
        c.generic(APP, shown, rel, p, None);
    }
    if c.runtimes.is_empty() {
        c.runtimes.push(RtInfo { runtime: Runtime::Native, node: None, dissected: true, confidence: Confidence::Low, evidence: ev(EvidenceKind::Default, "no other runtime detected"), version: None });
        progress(STAGE_RUNTIME, "native");
    }

    // ---- 의존 관계 (선언된 것만)
    // 1. 실행 파일이 불러온다고 적은 앱 안의 프레임워크와 dylib (LC_LOAD_DYLIB)
    let engine_stem = engine.as_deref().map(|e| e.trim_end_matches(".framework").to_string());
    for (from, p) in bins {
        for path in macho_dylibs(&read_prefix(p, 256 * 1024)) {
            // 앱 안을 가리키는 경로만 본다. 시스템 라이브러리는 담지 않는다.
            if !(path.starts_with("@rpath/") || path.starts_with("@executable_path/") || path.starts_with("@loader_path/")) {
                continue;
            }
            let target = match path.find(".framework/") {
                Some(i) => {
                    let stem = path[..i].rsplit('/').next().unwrap_or("");
                    if engine_stem.as_deref() == Some(stem) {
                        electron.and_then(|e| c.t.n[e].kids.get(stem).copied())
                    } else {
                        c.t.n[APP].kids.get(stem).copied()
                            .or_else(|| flutter.and_then(|f| c.t.n[f].kids.get(stem).copied()))
                            .or_else(|| rn.and_then(|r| c.t.n[r].kids.get(stem).copied()))
                    }
                }
                None => c.t.n[APP].kids.get(path.rsplit('/').next().unwrap_or("")).copied(),
            };
            if let Some(to) = target {
                c.t.need(from, to);
            }
        }
    }
    // 2. Electron의 구조: 런타임이 소유한 나머지(앱 묶음, 헬퍼 앱, 실행기)는 프레임워크 본체가 있어야 한다
    if let (Some(e), Some(stem)) = (electron, engine_stem.as_deref()) {
        if let Some(&fw) = c.t.n[e].kids.get(stem) {
            let others: Vec<usize> = c.t.n[e].kids.values().copied().filter(|&k| k != fw && !matches!(c.t.n[k].kind, NodeKind::Overhead | NodeKind::Shared | NodeKind::Link)).collect();
            for k in others {
                c.t.need(k, fw);
            }
        }
    }
}

// ------------------------------------------------------------------ Android APK

pub fn dissect_apk(c: &mut Ctx, files: &[Phys], info: &AppInfo) {
    let so: HashSet<&str> = files.iter().filter(|p| p.path.starts_with("lib/")).filter_map(|p| p.path.rsplit('/').next()).collect();
    if so.contains("libflutter.so") {
        c.detect(Runtime::Flutter, Confidence::High, "lib/<abi>/libflutter.so");
    }
    if so.contains("libreactnative.so") || so.iter().any(|n| n.starts_with("libhermes")) {
        c.detect(Runtime::ReactNative, Confidence::High, "lib/<abi>/libreactnative.so or libhermes*.so");
    } else if files.iter().any(|p| p.path == "assets/index.android.bundle") {
        c.detect(Runtime::ReactNative, Confidence::Medium, "assets/index.android.bundle");
    }
    let flutter = c.rt(Runtime::Flutter);
    let rn = c.rt(Runtime::ReactNative);
    let app_id_path = info.app_id.as_ref().map(|id| id.replace('.', "/"));
    let mut dexes: Vec<&Phys> = Vec::new();
    // 네이티브 라이브러리: (ABI, 파일 이름, 노드, 파일)
    let mut sos: Vec<(&str, &str, usize, &Phys)> = Vec::new();

    for p in files {
        let path = p.path.as_str();
        let base = path.rsplit('/').next().unwrap_or(path);
        if path.starts_with("META-INF/") && (base == "MANIFEST.MF" || base.ends_with(".SF") || base.ends_with(".RSA") || base.ends_with(".DSA") || base.ends_with(".EC")) {
            c.overhead(APP, p.size);
        } else if !path.contains('/') && path.starts_with("classes") && path.ends_with(".dex") {
            dexes.push(p);
        } else if let Some((abi, name)) = path.strip_prefix("lib/").and_then(|r| r.split_once('/')) {
            let fl = flutter.filter(|_| name == "libflutter.so" || name == "libapp.so");
            let rnn = rn.filter(|_| name == "libreactnative.so" || name == "libjsi.so" || name.starts_with("libhermes"));
            let parent = fl.or(rnn).unwrap_or(APP);
            let cn = c.t.node(parent, NodeKind::Container, abi, || Attr::container(ContainerType::Abi));
            let hit = if parent == APP { c.rules.lookup(MatchTarget::FileName, name, c.pk) } else { None };
            let id = c.t.leaf(cn, NodeKind::Library, name, p.size, p.csize, || {
                let a = if name == "libapp.so" && fl.is_some() {
                    Attr::origin(Origin::BundledAppCode, Confidence::High, EvidenceKind::Path, "libapp.so (Flutter app snapshot)").lump()
                } else if parent != APP {
                    Attr::origin(Origin::Runtime, Confidence::High, EvidenceKind::Path, name).lump()
                } else if let Some(h) = &hit {
                    Attr::hit(h, if h.rule.kind == RuleKind::Runtime { Origin::Runtime } else { Origin::Library })
                } else {
                    Attr::origin(Origin::Unidentified, Confidence::Low, EvidenceKind::Default, "no rule matched")
                };
                a.kind(FileKind::Executable)
            });
            sos.push((abi, name, id, p));
        } else if let (Some(f), Some(rest)) = (flutter, path.strip_prefix("assets/flutter_assets/")) {
            let lib = c.t.node(f, NodeKind::Library, "flutter_assets", || Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::Path, "assets/flutter_assets"));
            c.t.leaf(lib, NodeKind::Module, rest, p.size, p.csize, || Attr { origin: Some(Origin::Asset), confidence: Some(Confidence::Medium), file_kind: Some(file_kind(rest)), ..Default::default() });
        } else if rn.is_some() && path == "assets/index.android.bundle" {
            c.t.leaf(rn.unwrap(), NodeKind::Library, "index.android.bundle", p.size, p.csize, || Attr::origin(Origin::BundledAppCode, Confidence::High, EvidenceKind::Path, path).kind(FileKind::Script).lump());
        } else if let Some(hit) = c.rules.lookup(MatchTarget::Path, path, c.pk).or_else(|| c.rules.lookup(MatchTarget::FileName, base, c.pk)) {
            let name = hit.rule.name.clone();
            let lib = c.t.node(APP, NodeKind::Library, &name, || Attr::hit(&hit, Origin::Library));
            c.t.leaf(lib, NodeKind::Module, path, p.size, p.csize, || Attr { origin: Some(Origin::Library), confidence: Some(Confidence::Medium), file_kind: Some(file_kind(path)), ..Default::default() });
        } else if let Some(rest) = path.strip_prefix("res/") {
            let lib = c.t.node(APP, NodeKind::Library, "res", || Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::FileType, "res/"));
            // 리소스는 파일 수가 많다. 폴더 단위로 접는다.
            let dir = rest.split('/').next().unwrap_or(rest);
            c.t.leaf(lib, NodeKind::Module, dir, p.size, p.csize, || Attr { origin: Some(Origin::Asset), confidence: Some(Confidence::Medium), file_kind: Some(file_kind(rest)), ..Default::default() });
        } else if path == "resources.arsc" {
            c.t.leaf(APP, NodeKind::Library, path, p.size, p.csize, || Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::FileType, "resources.arsc").kind(FileKind::Localization));
        } else if let Some(rest) = path.strip_prefix("assets/") {
            // Android의 assets/는 경로로 에셋 판정한다 (계획 9.1)
            let a = || Attr::origin(Origin::Asset, Confidence::Medium, EvidenceKind::FileType, "assets/");
            match rest.split_once('/') {
                None => {
                    c.t.leaf(APP, NodeKind::Library, path, p.size, p.csize, || a().kind(file_kind(rest)));
                }
                Some((top, m)) => {
                    let lib = c.t.node(APP, NodeKind::Library, &format!("assets/{top}"), a);
                    c.t.leaf(lib, NodeKind::Module, m, p.size, p.csize, || Attr { origin: Some(Origin::Asset), confidence: Some(Confidence::Medium), file_kind: Some(file_kind(m)), ..Default::default() });
                }
            }
        } else {
            c.generic(APP, path, path, p, None);
        }
    }

    // ---- 네이티브 라이브러리 사이의 의존 (선언된 것만: DT_NEEDED)
    // 한 ABI의 파일만 읽고(arm64-v8a 우선) 같은 이름의 다른 ABI에 그대로 적용한다. 의존은 ABI 안에서만 잇는다.
    {
        let mut abis: Vec<&str> = sos.iter().map(|s| s.0).collect();
        abis.sort();
        abis.dedup();
        let pick = if abis.contains(&"arm64-v8a") { Some("arm64-v8a") } else { abis.first().copied() };
        if let Some(pick) = pick {
            let mut edges: Vec<(&str, String)> = Vec::new();
            for (_, name, _, p) in sos.iter().filter(|s| s.0 == pick) {
                for need in Ctx::elf_needs(p) {
                    edges.push((*name, need));
                }
            }
            // Flutter의 구조: 앱 스냅숏(libapp.so)은 엔진(libflutter.so)이 있어야 한다
            if flutter.is_some() {
                edges.push(("libapp.so", "libflutter.so".to_string()));
            }
            for (from_name, need) in &edges {
                for abi in &abis {
                    let find = |n: &str| sos.iter().find(|s| s.0 == *abi && s.1 == n).map(|s| s.2);
                    if let (Some(a), Some(b)) = (find(from_name), find(need.as_str())) {
                        c.t.need(a, b);
                    }
                }
            }
        }
    }

    // DEX: 여러 개를 하나로 합친다
    let (mut total, mut short, mut compose, mut shared) = (0usize, 0usize, 0usize, 0u64);
    dexes.sort_by(|a, b| a.path.cmp(&b.path));
    // DEX는 하나씩 풀고 클래스 표만 남긴다
    let mut parsed_all = Vec::new();
    for p in dexes {
        let parsed = if p.size <= MAX_DEX { let d = read_prefix(p, p.size as usize); if d.len() as u64 == p.size { dex_classes(&d) } else { None } } else { None };
        parsed_all.push((p, parsed));
    }
    // 앱 패키지 접두어: 매니페스트의 패키지 값. 그 아래에 클래스가 없으면 마디를 하나씩 줄여 본다(두 마디까지).
    // 계획 9.1의 "application과 activity 클래스 이름의 공통 접두어"를 대신하는 간이 방식이다.
    let mut app_prefix: Option<String> = None;
    let mut app_prefix_exact = true;
    if let Some(full) = &app_id_path {
        let mut cand = full.clone();
        loop {
            let pre = format!("{cand}/");
            if parsed_all.iter().any(|(_, r)| r.as_ref().map_or(false, |(cls, _)| cls.iter().any(|x| x.name.starts_with(&pre)))) {
                app_prefix = Some(cand.clone());
                app_prefix_exact = &cand == full;
                break;
            }
            match cand.rfind('/') {
                Some(i) if cand[..i].contains('/') => cand.truncate(i),
                _ => break,
            }
        }
    }
    for (p, parsed) in parsed_all {
        let cn = c.t.node(APP, NodeKind::Container, "dex", || Attr::container(ContainerType::ParsedFile));
        let Some((classes, sh)) = parsed else {
            c.failed(cn, &p.path, p, "dex");
            continue;
        };
        c.t.n[cn].paths.push(p.path.clone());
        shared += sh;
        for cl in classes {
            let name = cl.name.as_str();
            total += 1;
            let all_short = name.split('/').all(|s| s.len() <= 2);
            if all_short {
                short += 1;
            }
            if name.starts_with("androidx/compose/") {
                compose += 1;
            }
            let member = |a: Origin, conf: Confidence| Attr { origin: Some(a), confidence: Some(conf), file_kind: Some(FileKind::Executable), ..Default::default() };
            // 1. 런타임의 자바 쪽 코드 (확정: 런타임)
            let rt_java = if flutter.is_some() && name.starts_with("io/flutter/") {
                Some((flutter.unwrap(), "io/flutter/"))
            } else if rn.is_some() {
                RN_JAVA.iter().find(|pre| name.starts_with(**pre)).map(|pre| (rn.unwrap(), *pre))
            } else {
                None
            };
            if let Some((rt, pre)) = rt_java {
                let dc = c.t.node(rt, NodeKind::Container, "dex", || Attr::container(ContainerType::ParsedFile));
                let lib = c.t.node(dc, NodeKind::Library, pre.trim_end_matches('/'), || Attr::origin(Origin::Runtime, Confidence::Medium, EvidenceKind::Prefix, pre));
                c.t.leaf(lib, NodeKind::Module, &name[pre.len()..], cl.bytes, 0, || member(Origin::Runtime, Confidence::Medium));
                continue;
            }
            // 2. 앱 자체의 패키지
            if let Some(ap) = app_prefix.as_deref().filter(|ap| name.len() > ap.len() && name.starts_with(*ap) && name.as_bytes()[ap.len()] == b'/') {
                let detail = format!("AndroidManifest package {}", info.app_id.as_deref().unwrap_or(""));
                let conf = if app_prefix_exact { Confidence::High } else { Confidence::Medium };
                let lib = c.t.node(cn, NodeKind::Library, ap, || Attr::origin(Origin::AppCode, conf, if app_prefix_exact { EvidenceKind::Metadata } else { EvidenceKind::Prefix }, &detail));
                c.t.leaf(lib, NodeKind::Module, &name[ap.len() + 1..], cl.bytes, 0, || member(Origin::AppCode, conf));
                continue;
            }
            // 3. 식별 규칙
            if let Some(h) = c.rules.lookup(MatchTarget::DexClass, name, c.pk) {
                let lname = h.rule.name.clone();
                let conf = h.confidence;
                let lib = c.t.node(cn, NodeKind::Library, &lname, || Attr::hit(&h, Origin::Library));
                c.t.leaf(lib, NodeKind::Module, name, cl.bytes, 0, || member(Origin::Library, conf));
                continue;
            }
            // 4. 미식별: 이름이 줄여진 것은 한데 모으고, 나머지는 패키지 접두어 두 마디로 묶는다
            let un = || Attr::origin(Origin::Unidentified, Confidence::Low, EvidenceKind::Default, "no rule matched");
            let cut = name.match_indices('/').nth(1).map(|(i, _)| i);
            match cut.filter(|_| !all_short) {
                Some(i) => {
                    let lib = c.t.node(cn, NodeKind::Library, &name[..i], un);
                    c.t.leaf(lib, NodeKind::Module, &name[i + 1..], cl.bytes, 0, || member(Origin::Unidentified, Confidence::Low));
                }
                None => {
                    let lib = c.t.node(cn, NodeKind::Library, "(short or top-level names)", un);
                    c.t.leaf(lib, NodeKind::Module, name, cl.bytes, 0, || member(Origin::Unidentified, Confidence::Low));
                }
            }
        }
    }
    if let Some(&cn) = c.t.n[APP].kids.get("dex") {
        if shared > 0 {
            c.t.leaf(cn, NodeKind::Shared, "(shared)", shared, 0, Attr::default);
        }
        if total > 0 {
            c.t.n[cn].short_name_ratio = Some((short as f64 / total as f64 * 1000.0).round() / 1000.0);
        }
    }
    if c.runtimes.is_empty() {
        if compose >= COMPOSE_MIN_CLASSES {
            // 확정: Android에서도 Compose를 감지한다. Jetpack Compose와 구별되지 않는다.
            c.runtimes.push(RtInfo { runtime: Runtime::Compose, node: None, dissected: false, confidence: Confidence::Low, evidence: ev(EvidenceKind::Prefix, &format!("androidx/compose/ ({compose} classes)")), version: None });
            progress(STAGE_RUNTIME, "compose");
        } else {
            c.runtimes.push(RtInfo { runtime: Runtime::Native, node: None, dissected: true, confidence: Confidence::Low, evidence: ev(EvidenceKind::Default, "no other runtime detected"), version: None });
            progress(STAGE_RUNTIME, "native");
        }
    }
}
