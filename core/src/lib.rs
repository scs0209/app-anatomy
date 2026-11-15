//! 앱 해부도 코어. 입력을 판별하고, 해부기를 돌리고, 결과 JSON(schemaVersion 1)을 만든다.
//! 경계는 host-interface.md, 결과 형식은 schema/, 처리 규칙은 app-anatomy-dissectors.md를 따른다.

pub mod dissect;
pub mod host;
pub mod parsers;
pub mod phys;
pub mod tree;

use anatomy_schema::rules::{validate, RuleFile};
use anatomy_schema::*;
use dissect::{AppInfo, Ctx};
use host::{aborted, now, progress, read_at, u32le, u64le, DEADLINE, STAGE_ANALYZE, STAGE_DONE, STAGE_OPEN};
use phys::{read_prefix, read_zip_dir, Phys};
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use std::collections::BTreeSet;
use std::sync::atomic::Ordering::Relaxed;
use tree::RuleSet;

pub const ABI_VERSION: u32 = 1;
pub const TOOL_VERSION: &str = concat!(env!("CARGO_PKG_VERSION"), "-dev");

thread_local! {
    static RULES: RefCell<RuleSet> = RefCell::new(RuleSet::default());
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static DOC: RefCell<Option<AnatomyResult>> = const { RefCell::new(None) };
    static HASH_INPUT: RefCell<Vec<(String, u64, u32)>> = const { RefCell::new(Vec::new()) };
    /// 오류 JSON에 덧붙일 값 (예: E_MULTIPLE_APPS의 앱 목록).
    static ERROR_EXTRA: RefCell<Option<(&'static str, serde_json::Value)>> = const { RefCell::new(None) };
}

fn set_result(v: Vec<u8>) {
    RESULT.with(|r| *r.borrow_mut() = v);
}

struct Fail(i32, &'static str, String);

fn fail(f: Fail) -> i32 {
    let mut v = serde_json::json!({ "code": f.1, "message": f.2 });
    if let Some((k, extra)) = ERROR_EXTRA.with(|e| e.borrow_mut().take()) {
        v[k] = extra;
    }
    set_result(v.to_string().into_bytes());
    f.0
}

fn abort_error(what: &str) -> Option<Fail> {
    match aborted() {
        1 => Some(Fail(4, "E_LIMIT_EXCEEDED", format!("time limit exceeded while {what}"))),
        2 => Some(Fail(2, "E_IO", "the host could not read the input".into())),
        _ => None,
    }
}

/// 호스트의 항목 목록: [u32 경로 길이][경로][u64 크기][u8 종류]
fn read_host_listing() -> Option<Vec<(String, u64, bool)>> {
    let len = unsafe { host::host_listing_len() } as usize;
    let mut buf = vec![0u8; len];
    if unsafe { host::host_listing_read(buf.as_mut_ptr(), len as u32) } as usize != len {
        return None;
    }
    let mut out = Vec::new();
    let mut p = 0usize;
    while p < buf.len() {
        let n = u32le(&buf, p)? as usize;
        let path = std::str::from_utf8(buf.get(p + 4..p + 4 + n)?).ok()?.to_string();
        let size = u64le(&buf, p + 4 + n)?;
        let kind = *buf.get(p + 12 + n)?;
        p += 13 + n;
        out.push((path, size, kind == 1));
    }
    Some(out)
}

fn plist_info(data: &[u8], info: &mut AppInfo) {
    let Ok(v) = plist::Value::from_reader(std::io::Cursor::new(data)) else { return };
    let Some(d) = v.as_dictionary() else { return };
    let s = |k: &str| d.get(k).and_then(|x| x.as_string()).map(|x| x.to_string());
    if let Some(n) = s("CFBundleDisplayName").or_else(|| s("CFBundleName")) {
        info.name = n;
    }
    info.app_id = s("CFBundleIdentifier");
    info.version = s("CFBundleShortVersionString").or_else(|| s("CFBundleVersion"));
    info.executable = s("CFBundleExecutable");
}

fn summarize(root: &Node) -> (Completeness, Vec<CopySummary>) {
    let mut c = Completeness { total_bytes: root.bytes, unidentified_bytes: 0, opaque_bytes: 0, overhead_bytes: 0, shared_bytes: 0, parse_failed_nodes: 0 };
    let mut copies: Vec<CopySummary> = Vec::new();
    let mut stack = vec![root];
    while let Some(n) = stack.pop() {
        match n.kind {
            NodeKind::Overhead => c.overhead_bytes += n.bytes,
            NodeKind::Shared => c.shared_bytes += n.bytes,
            NodeKind::ParseFailed => c.parse_failed_nodes += 1,
            NodeKind::Container => {
                if let Some(t @ (ContainerType::Abi | ContainerType::Arch)) = n.container_type {
                    match copies.iter_mut().find(|x| x.container_type == t && x.name == n.name) {
                        Some(e) => e.bytes += n.bytes,
                        None => copies.push(CopySummary { container_type: t, name: n.name.clone(), bytes: n.bytes }),
                    }
                }
            }
            _ => {}
        }
        if n.children.is_empty() {
            match n.origin {
                Some(Origin::Unidentified) => c.unidentified_bytes += n.bytes,
                Some(Origin::BundledAppCode) => c.opaque_bytes += n.bytes,
                _ => {}
            }
        }
        stack.extend(n.children.iter());
    }
    let key = |x: &CopySummary| (if x.container_type == ContainerType::Abi { 0 } else { 1 }, x.name.clone());
    copies.sort_by_key(key);
    if copies.len() < 2 {
        copies.clear();
    }
    (c, copies)
}

fn analyze(input_kind: u32, opts: &serde_json::Value) -> Result<AnatomyResult, Fail> {
    let max_nodes = opts.get("maxNodes").and_then(|v| v.as_u64()).unwrap_or(1_000_000) as usize;
    let input_name = opts.get("inputName").and_then(|v| v.as_str()).unwrap_or("input").to_string();
    let chosen_app = opts.get("app").and_then(|v| v.as_str()).map(|s| s.to_string());
    // 호스트가 링크를 구별하지 못했으면(브라우저의 폴더 입력) 총량이 근사치다
    let approximate = opts.get("approximate").and_then(|v| v.as_bool()).unwrap_or(false);
    progress(STAGE_OPEN, "");
    let listing = read_host_listing().ok_or(Fail(4, "E_CORRUPT_INPUT", "host listing is malformed".into()))?;
    let mut warnings: Vec<Warning> = Vec::new();

    // 1. 물리 항목과 포장 형식
    let (all, container_size): (Vec<Phys>, Option<u64>) = if input_kind == 0 {
        let size = listing.first().ok_or(Fail(3, "E_UNSUPPORTED_FORMAT", "no input file".into()))?.1;
        let dir = read_zip_dir(size);
        if let Some(f) = abort_error("opening the input") {
            return Err(f);
        }
        (dir.ok_or(Fail(3, "E_UNSUPPORTED_FORMAT", "the input is not a ZIP-based file (.zip with an .app, .apk, .ipa)".into()))?, Some(size))
    } else {
        (listing.iter().enumerate().map(|(i, (path, size, link))| Phys { path: path.clone(), size: if *link { 0 } else { *size }, csize: 0, method: 0, lho: 0, file: i as u32 + 1, link: *link }).collect(), None)
    };
    HASH_INPUT.with(|h| {
        *h.borrow_mut() = match container_size {
            Some(size) => vec![(String::new(), size, 0)],
            None => all.iter().filter(|p| !p.link).map(|p| (p.path.clone(), p.size, p.file - 1)).collect(),
        }
    });
    if all.len() > max_nodes {
        return Err(Fail(4, "E_TOO_LARGE", format!("{} entries exceed the node limit {}", all.len(), max_nodes)));
    }
    let is_apk = input_kind == 0 && all.iter().any(|p| p.path == "AndroidManifest.xml");
    let (packaging, files, rels, outside): (Packaging, Vec<Phys>, Vec<String>, u64);
    let mut info = AppInfo { name: input_name.clone(), ..Default::default() };
    if is_apk {
        packaging = Packaging::Apk;
        rels = all.iter().map(|p| p.path.clone()).collect();
        files = all;
        outside = 0;
        if let Some(m) = files.iter().find(|p| p.path == "AndroidManifest.xml").filter(|p| p.size <= 4 * 1024 * 1024) {
            info.app_id = parsers::axml_package(&read_prefix(m, m.size as usize));
        }
    } else {
        // `.app` 뿌리: `Payload/X.app/` 또는 `X.app/`
        let root_of = |path: &str| -> Option<String> {
            let mut it = path.split('/');
            let a = it.next()?;
            if a.ends_with(".app") {
                return Some(format!("{a}/"));
            }
            let b = it.next()?;
            if a == "Payload" && b.ends_with(".app") { Some(format!("{a}/{b}/")) } else { None }
        };
        let roots: BTreeSet<String> = all.iter().filter_map(|p| root_of(&p.path)).collect();
        if roots.len() > 1 {
            // 고를 수 있게 앱 목록(이름과 크기)을 오류에 싣는다
            let apps: Vec<serde_json::Value> = roots.iter().map(|r| serde_json::json!({
                "name": r.trim_end_matches('/').rsplit('/').next().unwrap_or(""),
                "bytes": all.iter().filter(|p| p.path.starts_with(r.as_str())).map(|p| p.size).sum::<u64>(),
            })).collect();
            ERROR_EXTRA.with(|e| *e.borrow_mut() = Some(("apps", serde_json::Value::Array(apps))));
        }
        let root = match (roots.len(), &chosen_app) {
            (0, _) => return Err(Fail(3, "E_UNSUPPORTED_FORMAT", "no .app bundle and no AndroidManifest.xml found in the input".into())),
            (1, _) => roots.iter().next().unwrap().clone(),
            (_, Some(name)) if roots.iter().any(|r| r.trim_end_matches('/').rsplit('/').next() == Some(name.as_str())) => {
                ERROR_EXTRA.with(|e| *e.borrow_mut() = None);
                roots.iter().find(|r| r.trim_end_matches('/').rsplit('/').next() == Some(name.as_str())).unwrap().clone()
            }
            (_, Some(name)) => roots.iter().find(|r| r.trim_end_matches('/').rsplit('/').next() == Some(name.as_str())).cloned()
                .ok_or(Fail(3, "E_MULTIPLE_APPS", format!("no app named {name}; found: {}", roots.iter().map(|r| r.trim_end_matches('/')).collect::<Vec<_>>().join(", "))))?,
            _ => return Err(Fail(3, "E_MULTIPLE_APPS", format!("several apps found: {}", roots.iter().map(|r| r.trim_end_matches('/')).collect::<Vec<_>>().join(", ")))),
        };
        let mut f = Vec::new();
        let mut r = Vec::new();
        let mut out = 0u64;
        for p in all {
            match p.path.strip_prefix(root.as_str()) {
                Some(rel) => {
                    r.push(rel.to_string());
                    f.push(p);
                }
                None => out += p.size,
            }
        }
        let mac = r.iter().any(|x| x.starts_with("Contents/MacOS/"));
        if !mac && !r.iter().any(|x| x == "Info.plist") {
            return Err(Fail(3, "E_UNSUPPORTED_FORMAT", "the .app bundle has neither Contents/MacOS nor a top-level Info.plist".into()));
        }
        packaging = if mac { Packaging::MacosApp } else { Packaging::Ipa };
        if packaging == Packaging::Ipa && input_kind == 0 && !root.starts_with("Payload/") {
            warnings.push(Warning { code: "W_IPA_NO_PAYLOAD".into(), message: "the IPA has no Payload/ folder; the .app at the top level was used.".into(), path: Some(root.trim_end_matches('/').to_string()) });
        }
        info.name = root.trim_end_matches('/').rsplit('/').next().unwrap_or("app").trim_end_matches(".app").to_string();
        let plist_path = if mac { "Contents/Info.plist" } else { "Info.plist" };
        if let Some(i) = r.iter().position(|x| x == plist_path).filter(|&i| f[i].size <= 1024 * 1024) {
            plist_info(&read_prefix(&f[i], f[i].size as usize), &mut info);
        }
        files = f;
        rels = r;
        outside = out;
    }
    if info.name.is_empty() {
        info.name = input_name;
    }
    if let Some(f) = abort_error("reading app metadata") {
        return Err(f);
    }

    // 2. 해부
    progress(STAGE_ANALYZE, "");
    let doc = RULES.with(|rules| -> Result<AnatomyResult, Fail> {
        let rules = rules.borrow();
        let mut c = Ctx::new(&info.name, &rules, packaging);
        c.warnings = warnings;
        match packaging {
            Packaging::Apk => dissect::dissect_apk(&mut c, &files, &info),
            Packaging::MacosApp => dissect::dissect_apple(&mut c, &files, &rels, false, &info),
            Packaging::Ipa => dissect::dissect_apple(&mut c, &files, &rels, true, &info),
        }
        if let Some(f) = abort_error("analyzing") {
            return Err(f);
        }
        if c.t.len() > max_nodes {
            return Err(Fail(4, "E_TOO_LARGE", format!("{} nodes exceed the node limit {}", c.t.len(), max_nodes)));
        }
        // ZIP 자체가 포장 형식인 APK와 IPA: ZIP 목록과 헤더, 앱 밖의 항목은 overhead다 (계획 8.4)
        if let (Some(size), true) = (container_size, packaging != Packaging::MacosApp) {
            let data: u64 = files.iter().map(|p| p.csize).sum();
            let zip_overhead = size.saturating_sub(data) + outside;
            if zip_overhead > 0 {
                c.t.leaf(0, NodeKind::Overhead, "(overhead)", zip_overhead, 0, tree::Attr::default);
            }
        }
        let root = c.t.finish(0);
        let (completeness, copies) = summarize(&root);
        let mut runtimes: Vec<RuntimeSummary> = c.runtimes.iter().map(|r| RuntimeSummary {
            runtime: r.runtime,
            dissected: r.dissected,
            bytes: r.node.map(|n| c.t.n[n].name.clone()).and_then(|name| root.children.iter().find(|x| x.kind == NodeKind::Runtime && x.name == name)).map_or(0, |x| x.bytes),
            confidence: r.confidence,
            evidence: r.evidence.clone(),
            version: r.version.clone(),
        }).collect();
        runtimes.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        Ok(AnatomyResult {
            schema_version: SCHEMA_VERSION,
            tool_version: TOOL_VERSION.to_string(),
            rules_version: rules.version(),
            input_sha256: None,
            input: InputInfo { packaging, name: info.name.clone(), app_id: info.app_id.clone(), app_version: info.version.clone(), approximate },
            runtimes,
            completeness,
            copies,
            warnings: c.warnings,
            root,
        })
    })?;
    progress(STAGE_DONE, "");
    Ok(doc)
}

fn hash_file(file: u32, size: u64) -> Option<[u8; 32]> {
    let mut h = Sha256::new();
    let mut off = 0u64;
    while off < size {
        let chunk = read_at(file, off, (size - off).min(1 << 20) as usize);
        if chunk.is_empty() {
            return None;
        }
        off += chunk.len() as u64;
        h.update(&chunk);
    }
    Some(h.finalize().into())
}

// ------------------------------------------------------------------ 내보내는 함수

#[no_mangle]
pub extern "C" fn anatomy_abi_version() -> u32 {
    ABI_VERSION
}

#[no_mangle]
pub extern "C" fn anatomy_alloc(len: u32) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1) as usize);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub extern "C" fn anatomy_free(ptr: *mut u8, len: u32) {
    if !ptr.is_null() {
        unsafe { drop(Vec::from_raw_parts(ptr, 0, len.max(1) as usize)) }
    }
}

/// 규칙 파일(JSON) 하나를 넘긴다. 여러 번 부를 수 있다.
#[no_mangle]
pub extern "C" fn anatomy_init(rules: *const u8, rules_len: u32) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(rules, rules_len as usize) };
    let file: RuleFile = match serde_json::from_slice(bytes) {
        Ok(f) => f,
        Err(e) => return fail(Fail(2, "E_RULES_INVALID", format!("rule file is not valid (line {}, column {}): {e}", e.line(), e.column()))),
    };
    let errs = validate(&file);
    if let Some(e) = errs.first() {
        return fail(Fail(2, "E_RULES_INVALID", format!("rule file {}: {} problem(s); first: {}: {}", file.source.id, errs.len(), e.id.as_deref().unwrap_or("(file)"), e.message)));
    }
    RULES.with(|r| r.borrow_mut().add(file));
    0
}

/// 해석한다. input_kind 0: 파일 하나, 1: 폴더. 0이면 결과 버퍼에 결과 JSON(inputSha256은 null)이 있다.
#[no_mangle]
pub extern "C" fn anatomy_analyze(input_kind: u32, options: *const u8, options_len: u32) -> i32 {
    let opts: serde_json::Value = serde_json::from_slice(unsafe { std::slice::from_raw_parts(options, options_len as usize) }).unwrap_or(serde_json::Value::Null);
    let deadline_ms = opts.get("deadlineMs").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if deadline_ms > 0.0 {
        DEADLINE.store((now() + deadline_ms).to_bits(), Relaxed);
    }
    match analyze(input_kind, &opts) {
        Ok(doc) => {
            set_result(serde_json::to_vec(&doc).unwrap_or_default());
            DOC.with(|d| *d.borrow_mut() = Some(doc));
            0
        }
        Err(f) => fail(f),
    }
}

/// 입력의 SHA-256을 채운 최종 결과 JSON을 낸다. 기한은 적용하지 않는다.
/// 파일 하나: 그 파일의 해시. 폴더: 경로순으로 정렬한 (경로, NUL, 파일 해시)의 해시.
#[no_mangle]
pub extern "C" fn anatomy_finalize() -> i32 {
    DEADLINE.store(0, Relaxed);
    let mut files = HASH_INPUT.with(|h| h.borrow().clone());
    let io = || Fail(2, "E_IO", "the host could not read the input".into());
    let digest: [u8; 32] = if files.len() == 1 && files[0].0.is_empty() {
        match hash_file(files[0].2, files[0].1) {
            Some(d) => d,
            None => return fail(io()),
        }
    } else {
        files.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
        let mut h = Sha256::new();
        for (path, size, file) in &files {
            let d: [u8; 32] = if *size == 0 { Sha256::digest([]).into() } else {
                match hash_file(*file, *size) {
                    Some(d) => d,
                    None => return fail(io()),
                }
            };
            h.update(path.as_bytes());
            h.update([0u8]);
            h.update(d);
        }
        h.finalize().into()
    };
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    let out = DOC.with(|d| {
        let mut d = d.borrow_mut();
        let doc = d.as_mut()?;
        doc.input_sha256 = Some(hex);
        serde_json::to_vec(doc).ok()
    });
    match out {
        Some(v) => {
            set_result(v);
            0
        }
        None => fail(Fail(4, "E_INTERNAL", "anatomy_finalize was called before a successful anatomy_analyze".into())),
    }
}

#[no_mangle]
pub extern "C" fn anatomy_result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn anatomy_result_len() -> u32 {
    RESULT.with(|r| r.borrow().len() as u32)
}

/// 측정용: 범위 읽기 횟수. 인터페이스의 일부가 아니다.
#[no_mangle]
pub extern "C" fn anatomy_debug_reads() -> f64 {
    host::READS.load(Relaxed) as f64
}
