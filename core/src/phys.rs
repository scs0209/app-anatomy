//! 물리 항목: ZIP 목록과 폴더 목록. 필요한 앞부분만 읽는다.
use crate::host::{read_at, u16le, u32le, u64le};
use miniz_oxide::inflate::stream::{inflate, InflateState};
use miniz_oxide::{DataFormat, MZFlush, MZStatus};

#[derive(Clone)]
pub struct Phys {
    pub path: String,
    pub size: u64,
    /// ZIP 안에서 차지하는 압축된 크기. 폴더 입력이면 0.
    pub csize: u64,
    pub method: u32,
    pub lho: u64,
    /// 0이면 ZIP(호스트 항목 0)의 멤버, 아니면 호스트 항목 번호 + 1.
    pub file: u32,
    pub link: bool,
}

pub const MAX_ENTRY_INFLATE: u64 = 256 * 1024 * 1024;

/// ZIP 끝의 목록을 읽는다. 폴더 항목과 `__MACOSX/`는 버린다. 링크 항목은 남긴다.
pub fn read_zip_dir(size: u64) -> Option<Vec<Phys>> {
    let tail_len = size.min(65_557) as usize;
    let tail = read_at(0, size - tail_len as u64, tail_len);
    let mut i = tail.len().checked_sub(22)?;
    let e = loop {
        if u32le(&tail, i)? == 0x0605_4b50 {
            break i;
        }
        if i == 0 {
            return None;
        }
        i -= 1;
    };
    let mut count = u16le(&tail, e + 10)? as u64;
    let mut cd_size = u32le(&tail, e + 12)? as u64;
    let mut cd_off = u32le(&tail, e + 16)? as u64;
    if count == 0xFFFF || cd_size == 0xFFFF_FFFF || cd_off == 0xFFFF_FFFF {
        let loc = e.checked_sub(20)?;
        if u32le(&tail, loc)? == 0x0706_4b50 {
            let z = read_at(0, u64le(&tail, loc + 8)?, 56);
            count = u64le(&z, 32)?;
            cd_size = u64le(&z, 40)?;
            cd_off = u64le(&z, 48)?;
        }
    }
    if cd_size > MAX_ENTRY_INFLATE || cd_off.checked_add(cd_size)? > size {
        return None;
    }
    let cd = read_at(0, cd_off, cd_size as usize);
    let mut items = Vec::with_capacity((count as usize).min(1 << 20));
    let mut p = 0usize;
    while p + 46 <= cd.len() && u32le(&cd, p)? == 0x0201_4b50 {
        let method = u16le(&cd, p + 10)?;
        let mut csize = u32le(&cd, p + 20)? as u64;
        let mut usize_ = u32le(&cd, p + 24)? as u64;
        let nlen = u16le(&cd, p + 28)? as usize;
        let xlen = u16le(&cd, p + 30)? as usize;
        let clen = u16le(&cd, p + 32)? as usize;
        let attr = u32le(&cd, p + 38)?;
        let mut lho = u32le(&cd, p + 42)? as u64;
        let name = cd.get(p + 46..p + 46 + nlen)?;
        let extra = cd.get(p + 46 + nlen..p + 46 + nlen + xlen)?;
        let mut x = 0;
        while x + 4 <= extra.len() {
            let id = u16le(extra, x)?;
            let len = u16le(extra, x + 2)? as usize;
            if id == 1 {
                let mut q = x + 4;
                if usize_ == 0xFFFF_FFFF {
                    usize_ = u64le(extra, q)?;
                    q += 8;
                }
                if csize == 0xFFFF_FFFF {
                    csize = u64le(extra, q)?;
                    q += 8;
                }
                if lho == 0xFFFF_FFFF {
                    lho = u64le(extra, q)?;
                }
            }
            x += 4 + len;
        }
        p += 46 + nlen + xlen + clen;
        if name.ends_with(b"/") || name.starts_with(b"__MACOSX/") {
            continue;
        }
        let link = (attr >> 16) & 0o170000 == 0o120000;
        items.push(Phys { path: String::from_utf8_lossy(name).into_owned(), size: if link { 0 } else { usize_ }, csize, method, lho, file: 0, link });
    }
    Some(items)
}

/// 항목의 앞부분 want 바이트. 압축된 항목은 필요한 만큼만 푼다. 실패하면 짧게 돌아온다.
pub fn read_prefix(it: &Phys, want: usize) -> Vec<u8> {
    if it.file != 0 {
        return read_at(it.file - 1, 0, want.min(it.size as usize));
    }
    let lh = read_at(0, it.lho, 30);
    let (Some(n), Some(m)) = (u16le(&lh, 26), u16le(&lh, 28)) else { return Vec::new() };
    let data = it.lho + 30 + n as u64 + m as u64;
    if it.method == 0 {
        return read_at(0, data, want.min(it.csize as usize));
    }
    if it.method != 8 {
        return Vec::new();
    }
    let mut out = vec![0u8; want];
    let mut written = 0usize;
    let mut state = InflateState::new_boxed(DataFormat::Raw);
    let mut pos = 0u64;
    const CHUNK: usize = 256 * 1024;
    'outer: while written < want && pos < it.csize {
        let chunk = read_at(0, data + pos, CHUNK.min((it.csize - pos) as usize));
        if chunk.is_empty() {
            break;
        }
        pos += chunk.len() as u64;
        let mut input = &chunk[..];
        while !input.is_empty() && written < want {
            let r = inflate(&mut state, input, &mut out[written..], MZFlush::None);
            input = &input[r.bytes_consumed..];
            written += r.bytes_written;
            match r.status {
                Ok(MZStatus::Ok) if r.bytes_consumed != 0 || r.bytes_written != 0 => {}
                _ => break 'outer,
            }
        }
    }
    out.truncate(written);
    out
}

/// 항목 안의 여러 구간 (시작, 길이)을 읽는다. 폴더 입력과 압축하지 않은 ZIP 항목은 그 자리만 읽는다.
/// 압축된 항목은 앞에서부터 한 번만 풀며 지나가고, 가장 뒤 구간까지만 푼다. 실패한 구간은 짧게 돌아온다.
pub fn read_ranges(it: &Phys, ranges: &[(u64, usize)]) -> Vec<Vec<u8>> {
    let mut out: Vec<Vec<u8>> = ranges.iter().map(|_| Vec::new()).collect();
    if ranges.is_empty() {
        return out;
    }
    if it.file != 0 {
        for (i, (o, l)) in ranges.iter().enumerate() {
            if *o < it.size {
                out[i] = read_at(it.file - 1, *o, (*l).min((it.size - *o) as usize));
            }
        }
        return out;
    }
    let lh = read_at(0, it.lho, 30);
    let (Some(n), Some(m)) = (u16le(&lh, 26), u16le(&lh, 28)) else { return out };
    let data = it.lho + 30 + n as u64 + m as u64;
    if it.method == 0 {
        for (i, (o, l)) in ranges.iter().enumerate() {
            if *o < it.csize {
                out[i] = read_at(0, data + *o, (*l).min((it.csize - *o) as usize));
            }
        }
        return out;
    }
    let end = ranges.iter().map(|(o, l)| o.saturating_add(*l as u64)).max().unwrap_or(0).min(it.size);
    if it.method != 8 || end > MAX_ENTRY_INFLATE {
        return out;
    }
    let mut state = InflateState::new_boxed(DataFormat::Raw);
    const CHUNK: usize = 256 * 1024;
    let mut buf = vec![0u8; CHUNK];
    let (mut produced, mut pos) = (0u64, 0u64);
    'outer: while produced < end && pos < it.csize {
        let chunk = read_at(0, data + pos, CHUNK.min((it.csize - pos) as usize));
        if chunk.is_empty() {
            break;
        }
        pos += chunk.len() as u64;
        let mut input = &chunk[..];
        loop {
            let r = inflate(&mut state, input, &mut buf, MZFlush::None);
            input = &input[r.bytes_consumed..];
            let w = r.bytes_written;
            if w > 0 {
                let (a, b) = (produced, produced + w as u64);
                for (i, (o, l)) in ranges.iter().enumerate() {
                    let (s, e) = (a.max(*o), b.min(o.saturating_add(*l as u64)));
                    if s < e {
                        out[i].extend_from_slice(&buf[(s - a) as usize..(e - a) as usize]);
                    }
                }
                produced = b;
            }
            if produced >= end {
                break 'outer;
            }
            match r.status {
                Ok(MZStatus::Ok) => {}
                _ if input.is_empty() && w == 0 && r.bytes_consumed == 0 => break, // 입력이 더 필요하다
                _ => break 'outer,
            }
            if r.bytes_consumed == 0 && w == 0 {
                if input.is_empty() { break } else { break 'outer }
            }
            if input.is_empty() && w < buf.len() {
                break;
            }
        }
    }
    out
}

/// 링크 항목의 대상. ZIP에서는 항목의 내용이 대상 경로다.
pub fn link_target(it: &Phys) -> Option<String> {
    if it.file != 0 {
        let mut buf = [0u8; 1024];
        let n = unsafe { crate::host::host_link_target(it.file - 1, buf.as_mut_ptr(), buf.len() as u32) };
        return if n >= 0 { Some(String::from_utf8_lossy(&buf[..n as usize]).into_owned()) } else { None };
    }
    let mut z = it.clone();
    z.size = 1024;
    let d = read_prefix(&z, 1024);
    if d.is_empty() { None } else { Some(String::from_utf8_lossy(&d).into_owned()) }
}
