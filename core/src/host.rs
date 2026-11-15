//! 호스트 경계 (host-interface.md). 범위 읽기, 진행 보고, 시계, 기한.
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "anatomy_host")]
extern "C" {
    pub fn host_listing_len() -> u32;
    pub fn host_listing_read(ptr: *mut u8, len: u32) -> u32;
    fn host_read(file: u32, offset: f64, ptr: *mut u8, len: u32) -> i32;
    pub fn host_link_target(file: u32, ptr: *mut u8, cap: u32) -> i32;
    fn host_progress(stage: u32, detail: *const u8, detail_len: u32);
    fn host_now_ms() -> f64;
}

// 네이티브 빌드(단위 시험, 퍼징)에서는 호스트가 없다. 읽기는 실패한다.
#[cfg(not(target_arch = "wasm32"))]
mod stub {
    pub unsafe fn host_listing_len() -> u32 { 0 }
    pub unsafe fn host_listing_read(_: *mut u8, _: u32) -> u32 { 0 }
    pub unsafe fn host_read(_: u32, _: f64, _: *mut u8, _: u32) -> i32 { -1 }
    pub unsafe fn host_link_target(_: u32, _: *mut u8, _: u32) -> i32 { -1 }
    pub unsafe fn host_progress(_: u32, _: *const u8, _: u32) {}
    pub unsafe fn host_now_ms() -> f64 { 0.0 }
}
#[cfg(not(target_arch = "wasm32"))]
pub use stub::{host_link_target, host_listing_len, host_listing_read};
#[cfg(not(target_arch = "wasm32"))]
use stub::{host_now_ms, host_progress, host_read};

pub const STAGE_OPEN: u32 = 1;
pub const STAGE_RUNTIME: u32 = 2;
pub const STAGE_ANALYZE: u32 = 3;
pub const STAGE_DONE: u32 = 4;
const MAX_EXACT_OFFSET: u64 = 1 << 53;

/// 0 = 정상, 1 = 기한 초과, 2 = 호스트 읽기 오류
pub static ABORT: AtomicU64 = AtomicU64::new(0);
pub static DEADLINE: AtomicU64 = AtomicU64::new(0);
pub static READS: AtomicU64 = AtomicU64::new(0);

pub fn now() -> f64 {
    unsafe { host_now_ms() }
}
pub fn progress(stage: u32, detail: &str) {
    unsafe { host_progress(stage, detail.as_ptr(), detail.len() as u32) }
}
pub fn aborted() -> u64 {
    ABORT.load(Relaxed)
}

/// 범위 읽기. 읽기 전에 기한을 확인한다. 실패하면 빈 값을 돌려주고 ABORT를 세운다.
pub fn read_at(file: u32, off: u64, len: usize) -> Vec<u8> {
    if ABORT.load(Relaxed) != 0 || len == 0 {
        return Vec::new();
    }
    let deadline = f64::from_bits(DEADLINE.load(Relaxed));
    if deadline > 0.0 && now() > deadline {
        ABORT.store(1, Relaxed);
        return Vec::new();
    }
    if off >= MAX_EXACT_OFFSET {
        ABORT.store(2, Relaxed);
        return Vec::new();
    }
    let mut buf = vec![0u8; len];
    let n = unsafe { host_read(file, off as f64, buf.as_mut_ptr(), len as u32) };
    if n < 0 {
        ABORT.store(2, Relaxed);
        return Vec::new();
    }
    READS.fetch_add(1, Relaxed);
    buf.truncate((n as usize).min(len));
    buf
}

pub fn u16le(d: &[u8], o: usize) -> Option<u32> {
    Some(u16::from_le_bytes(d.get(o..o.checked_add(2)?)?.try_into().ok()?) as u32)
}
pub fn u32le(d: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_le_bytes(d.get(o..o.checked_add(4)?)?.try_into().ok()?))
}
pub fn u64le(d: &[u8], o: usize) -> Option<u64> {
    Some(u64::from_le_bytes(d.get(o..o.checked_add(8)?)?.try_into().ok()?))
}
pub fn u32be(d: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_be_bytes(d.get(o..o.checked_add(4)?)?.try_into().ok()?))
}
