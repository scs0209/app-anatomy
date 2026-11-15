// 호스트 인터페이스 v1의 공통 로더. 브라우저 Worker와 Node가 같이 쓴다. (host-interface.md)
//
// source: {
//   entries: [{ path, size, link? }],             항목 목록. 파일 하나짜리 입력이면 항목이 하나다.
//   read(file, offset, into) -> number,            into(Uint8Array)에 채우고 읽은 바이트 수를 돌려준다. 실패하면 음수.
//   linkTarget(file) -> string | null,             모르면 null.
// }
// hooks: { onProgress(stage, detail), now() }
export const ABI_VERSION = 1;
export const STAGES = { 1: "open", 2: "runtime-detected", 3: "analyzing", 4: "done" };
export const INPUT_FILE = 0, INPUT_FOLDER = 1;
const enc = new TextEncoder(), dec = new TextDecoder();

export function encodeListing(entries) {
  const names = entries.map(e => enc.encode(e.path));
  const out = new Uint8Array(names.reduce((s, n) => s + n.length + 13, 0));
  const view = new DataView(out.buffer);
  let p = 0;
  entries.forEach((e, i) => {
    view.setUint32(p, names[i].length, true); p += 4;
    out.set(names[i], p); p += names[i].length;
    view.setBigUint64(p, BigInt(e.size), true); p += 8;
    out[p++] = e.link ? 1 : 0;
  });
  return out;
}

export function createCore(module, source, hooks = {}) {
  const listing = encodeListing(source.entries);
  const now = hooks.now || (() => performance.now());
  let inst, dead = false;
  const mem = (ptr, len) => new Uint8Array(inst.exports.memory.buffer, ptr, len);
  const imports = { anatomy_host: {
    host_listing_len: () => listing.length,
    host_listing_read: (ptr, len) => { const n = Math.min(len, listing.length); mem(ptr, n).set(listing.subarray(0, n)); return n; },
    host_read: (file, offset, ptr, len) => {
      try { return source.read(file, offset, mem(ptr, len)); } catch { return -1; }
    },
    host_link_target: (file, ptr, cap) => {
      const t = source.linkTarget ? source.linkTarget(file) : null;
      if (t == null) return -1;
      const b = enc.encode(t);
      if (b.length > cap) return -1;
      mem(ptr, b.length).set(b);
      return b.length;
    },
    host_progress: (stage, ptr, len) => { if (hooks.onProgress) hooks.onProgress(STAGES[stage] || String(stage), dec.decode(mem(ptr, len).slice())); },
    host_now_ms: now,
  } };
  inst = new WebAssembly.Instance(module, imports);
  if (inst.exports.anatomy_abi_version() !== ABI_VERSION) throw new Error("core ABI version mismatch");
  const put = bytes => { const ptr = inst.exports.anatomy_alloc(bytes.length); mem(ptr, bytes.length).set(bytes); return ptr; };
  const result = () => mem(inst.exports.anatomy_result_ptr(), inst.exports.anatomy_result_len()).slice();
  // 코어를 부른다. 트랩이 나면 이 인스턴스는 더 쓰지 않는다.
  const call = fn => {
    if (dead) return { ok: false, error: { code: "E_INTERNAL", message: "this core instance was discarded" } };
    let status;
    try { status = fn(); } catch (e) {
      dead = true;
      return { ok: false, error: { code: "E_INTERNAL", message: String(e && e.message || e) } };
    }
    const bytes = result();
    return status === 0 ? { ok: true, bytes } : { ok: false, status, error: JSON.parse(dec.decode(bytes)) };
  };
  return {
    addRules(text) {
      const b = typeof text === "string" ? enc.encode(text) : text;
      const ptr = put(b);
      const r = call(() => inst.exports.anatomy_init(ptr, b.length));
      inst.exports.anatomy_free(ptr, b.length);
      return r;
    },
    analyze(inputKind, options = {}) {
      const b = enc.encode(JSON.stringify(options));
      const ptr = put(b);
      const r = call(() => inst.exports.anatomy_analyze(inputKind, ptr, b.length));
      if (!dead) inst.exports.anatomy_free(ptr, b.length);
      return r;
    },
    // 해시를 채운 최종 결과 JSON의 바이트 (실제 코어)
    finalizeRaw() {
      return call(() => inst.exports.anatomy_finalize());
    },
    finalize() {
      const r = call(() => inst.exports.anatomy_finalize());
      return r.ok ? { ok: true, ...JSON.parse(dec.decode(r.bytes)) } : r;
    },
    memoryBytes: () => inst.exports.memory.buffer.byteLength,
    debugStat: i => inst.exports.anatomy_debug_stat ? inst.exports.anatomy_debug_stat(i) : 0,
    reads: () => inst.exports.anatomy_debug_reads ? inst.exports.anatomy_debug_reads() : 0,
  };
}
