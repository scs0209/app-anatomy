//! 안쪽 파서: asar 머리말, DEX, Mach-O 머리말, 이진 XML. 모두 실패 값을 돌려주고 패닉하지 않는다.
use crate::host::{u16le, u32be, u32le};

// ------------------------------------------------------------------ asar

pub struct AsarFile {
    pub path: String,
    pub size: u64,
    pub unpacked: bool,
}

/// asar 머리말의 JSON 길이. 앞 16바이트에서 읽는다.
pub fn asar_json_len(head: &[u8]) -> Option<usize> {
    let n = u32le(head, 12)? as usize;
    if n > 64 * 1024 * 1024 { None } else { Some(n) }
}

pub fn asar_files(json: &[u8]) -> Option<Vec<AsarFile>> {
    let v: serde_json::Value = serde_json::from_slice(json).ok()?;
    let mut out = Vec::new();
    // 재귀 대신 명시적 스택 (중첩 깊이 한도)
    let mut stack: Vec<(&serde_json::Value, String)> = vec![(&v, String::new())];
    while let Some((node, prefix)) = stack.pop() {
        if prefix.matches('/').count() > 64 {
            return None;
        }
        let Some(files) = node.get("files").and_then(|f| f.as_object()) else { continue };
        for (name, child) in files {
            let p = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            if child.get("files").is_some() {
                stack.push((child, p));
            } else if child.get("link").is_none() {
                let size = child.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                out.push(AsarFile { path: p, size, unpacked: child.get("unpacked").and_then(|u| u.as_bool()) == Some(true) });
            }
        }
    }
    Some(out)
}

// ------------------------------------------------------------------ DEX

fn uleb(d: &[u8], p: &mut usize) -> Option<u32> {
    let mut r = 0u32;
    let mut s = 0;
    loop {
        let b = *d.get(*p)?;
        *p += 1;
        r |= ((b & 0x7f) as u32).checked_shl(s)?;
        if b & 0x80 == 0 {
            return Some(r);
        }
        s += 7;
        if s > 28 {
            return None;
        }
    }
}

pub struct DexClass {
    /// `com/example/Foo` 형태.
    pub name: String,
    pub bytes: u64,
}

/// 클래스마다 고유 바이트(class_def, class_data, code_item)를 돌려준다. 나머지는 shared다.
pub fn dex_classes(d: &[u8]) -> Option<(Vec<DexClass>, u64)> {
    if d.get(..3)? != b"dex" {
        return None;
    }
    let str_off = u32le(d, 0x3C)? as usize;
    let type_off = u32le(d, 0x44)? as usize;
    let n_class = u32le(d, 0x60)? as usize;
    let class_off = u32le(d, 0x64)? as usize;
    if n_class > d.len() / 32 {
        return None;
    }
    let mut out = Vec::with_capacity(n_class);
    let mut owned = 0u64;
    for i in 0..n_class {
        let cd = class_off.checked_add(32usize.checked_mul(i)?)?;
        let class_idx = u32le(d, cd)? as usize;
        let data_off = u32le(d, cd + 24)? as usize;
        let sidx = u32le(d, type_off.checked_add(class_idx.checked_mul(4)?)?)? as usize;
        let mut p = u32le(d, str_off.checked_add(sidx.checked_mul(4)?)?)? as usize;
        uleb(d, &mut p)?;
        let end = p + d.get(p..)?.iter().position(|&b| b == 0)?;
        let desc = String::from_utf8_lossy(d.get(p..end)?);
        let name = desc.strip_prefix('L').and_then(|s| s.strip_suffix(';')).unwrap_or(&desc).to_string();
        let mut bytes = 32u64;
        if data_off != 0 {
            let mut q = data_off;
            let sf = uleb(d, &mut q)? as u64;
            let inf = uleb(d, &mut q)? as u64;
            let dm = uleb(d, &mut q)? as u64;
            let vm = uleb(d, &mut q)? as u64;
            if sf + inf + dm + vm > d.len() as u64 {
                return None;
            }
            for _ in 0..(sf + inf) {
                uleb(d, &mut q)?;
                uleb(d, &mut q)?;
            }
            for _ in 0..(dm + vm) {
                uleb(d, &mut q)?;
                uleb(d, &mut q)?;
                let code = uleb(d, &mut q)? as usize;
                if code != 0 {
                    let tries = u16le(d, code.checked_add(6)?)? as u64;
                    let insns = u32le(d, code.checked_add(12)?)? as u64;
                    bytes += 16 + insns * 2 + tries * 8 + if tries > 0 && insns % 2 == 1 { 2 } else { 0 };
                }
            }
            bytes += (q - data_off) as u64;
        }
        owned += bytes;
        out.push(DexClass { name, bytes });
    }
    if owned > d.len() as u64 {
        return None;
    }
    Some((out, d.len() as u64 - owned))
}

// ------------------------------------------------------------------ Mach-O

pub struct MachO {
    /// (아키텍처 이름, 조각 크기). thin이면 하나.
    pub slices: Vec<(String, u64)>,
    /// fat 헤더와 패딩.
    pub overhead: u64,
    pub encrypted: bool,
}

fn arch_name(cputype: u32) -> String {
    match cputype {
        0x0100_000C => "arm64".into(),
        0x0100_0007 => "x86_64".into(),
        0x0000_000C => "arm".into(),
        0x0000_0007 => "i386".into(),
        0x0200_000C => "arm64_32".into(),
        other => format!("cpu-{other:#x}"),
    }
}

/// 파일의 앞부분과 전체 크기로 Mach-O를 본다. Mach-O가 아니면 None.
pub fn macho(head: &[u8], total: u64) -> Option<MachO> {
    let be = u32be(head, 0)?;
    if be == 0xCAFE_BABE || be == 0xCAFE_BABF {
        let n = u32be(head, 4)? as usize;
        if n == 0 || n > 16 {
            return None; // 자바 클래스 파일도 같은 매직을 쓴다
        }
        let step = if be == 0xCAFE_BABE { 20 } else { 32 };
        let mut slices = Vec::new();
        let mut used = 0u64;
        for i in 0..n {
            let o = 8 + i * step;
            let size = if step == 20 { u32be(head, o + 12)? as u64 } else { ((u32be(head, o + 16)? as u64) << 32) | u32be(head, o + 20)? as u64 };
            used = used.checked_add(size)?;
            slices.push((arch_name(u32be(head, o)?), size));
        }
        if used > total {
            return None;
        }
        return Some(MachO { slices, overhead: total - used, encrypted: false });
    }
    let le = u32le(head, 0)?;
    if le != 0xFEED_FACF && le != 0xFEED_FACE {
        return None;
    }
    let hdr = if le == 0xFEED_FACF { 32 } else { 28 };
    let ncmds = u32le(head, 16)? as usize;
    let mut off = hdr;
    let mut encrypted = false;
    for _ in 0..ncmds.min(4096) {
        let (Some(cmd), Some(size)) = (u32le(head, off), u32le(head, off + 4)) else { break };
        if cmd == 0x2C || cmd == 0x21 {
            encrypted = u32le(head, off + 16).unwrap_or(0) != 0;
            break;
        }
        if size < 8 {
            break;
        }
        off += size as usize;
    }
    Some(MachO { slices: vec![(arch_name(u32le(head, 4)?), total)], overhead: 0, encrypted })
}

// ------------------------------------------------------------------ 이진 XML (AndroidManifest.xml)

fn axml_string(d: &[u8], pool: usize, idx: usize) -> Option<String> {
    let count = u32le(d, pool + 8)? as usize;
    if idx >= count {
        return None;
    }
    let flags = u32le(d, pool + 16)?;
    let strings_start = u32le(d, pool + 20)? as usize;
    let off = u32le(d, pool + 28 + idx * 4)? as usize;
    let mut p = pool.checked_add(strings_start)?.checked_add(off)?;
    if flags & (1 << 8) != 0 {
        // UTF-8: 글자 수(1~2바이트), 바이트 수(1~2바이트), 내용
        if *d.get(p)? & 0x80 != 0 { p += 2 } else { p += 1 }
        let mut len = *d.get(p)? as usize;
        p += 1;
        if len & 0x80 != 0 {
            len = ((len & 0x7f) << 8) | *d.get(p)? as usize;
            p += 1;
        }
        Some(String::from_utf8_lossy(d.get(p..p.checked_add(len)?)?).into_owned())
    } else {
        let mut len = u16le(d, p)? as usize;
        p += 2;
        if len & 0x8000 != 0 {
            len = ((len & 0x7fff) << 16) | u16le(d, p)? as usize;
            p += 2;
        }
        let units: Vec<u16> = (0..len).map(|i| u16le(d, p + i * 2).map(|v| v as u16)).collect::<Option<_>>()?;
        Some(String::from_utf16_lossy(&units))
    }
}

/// 매니페스트의 `package` 값.
pub fn axml_package(d: &[u8]) -> Option<String> {
    if u16le(d, 0)? != 0x0003 {
        return None;
    }
    let mut p = u16le(d, 2)? as usize;
    let mut pool = None;
    let mut guard = 0;
    while p + 8 <= d.len() && guard < 100_000 {
        guard += 1;
        let ty = u16le(d, p)?;
        let hsize = u16le(d, p + 2)? as usize;
        let size = u32le(d, p + 4)? as usize;
        if size < 8 {
            return None;
        }
        if ty == 0x0001 && pool.is_none() {
            pool = Some(p);
        } else if ty == 0x0102 {
            let pool = pool?;
            let name = axml_string(d, pool, u32le(d, p + hsize + 4)? as usize)?;
            if name != "manifest" {
                return None;
            }
            let attr_start = u16le(d, p + hsize + 8)? as usize;
            let attr_size = (u16le(d, p + hsize + 10)? as usize).max(20);
            let attr_count = u16le(d, p + hsize + 12)? as usize;
            for i in 0..attr_count {
                let a = p + hsize + attr_start + i * attr_size;
                if axml_string(d, pool, u32le(d, a + 4)? as usize).as_deref() == Some("package") {
                    return axml_string(d, pool, u32le(d, a + 8)? as usize);
                }
            }
            return None;
        }
        p = p.checked_add(size)?;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn garbage_never_panics() {
        // 변이 퍼징의 축소판: 짧고 깨진 입력에서 패닉 없이 None이 나와야 한다.
        let seeds: [&[u8]; 6] = [b"", b"dex\n035\0", &[0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 3], &[0xCF, 0xFA, 0xED, 0xFE], &[3, 0, 8, 0, 255, 255, 255, 255], b"{\"files\":{\"a\":{\"files\":{}}}}"];
        for s in seeds {
            for n in 0..200usize {
                let mut d = s.to_vec();
                d.resize(n, (n * 37 % 251) as u8);
                let _ = dex_classes(&d);
                let _ = macho(&d, d.len() as u64);
                let _ = axml_package(&d);
                let _ = asar_files(&d);
                let _ = asar_json_len(&d);
            }
        }
    }

    #[test]
    fn fat_header() {
        let mut d = vec![0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 2];
        for (cpu, off, size) in [(0x0100_0007u32, 4096u32, 100u32), (0x0100_000C, 8192, 200)] {
            d.extend_from_slice(&cpu.to_be_bytes());
            d.extend_from_slice(&0u32.to_be_bytes());
            d.extend_from_slice(&off.to_be_bytes());
            d.extend_from_slice(&size.to_be_bytes());
            d.extend_from_slice(&12u32.to_be_bytes());
        }
        let m = macho(&d, 8392).unwrap();
        assert_eq!(m.slices, vec![("x86_64".to_string(), 100), ("arm64".to_string(), 200)]);
        assert_eq!(m.overhead, 8392 - 300);
    }
}
