// 모듈 Worker. 입력 하나를 해석하고 끝난다. 취소는 메인 스레드가 이 Worker를 종료하는 방식이다.
import { createCore, INPUT_FILE, INPUT_FOLDER } from "./loader.mjs";
const reader = new FileReaderSync();

onmessage = ev => {
  const m = ev.data;
  if (m.type !== "analyze") return;
  try {
    const folder = !!m.files;
    const blobs = folder ? m.files.map(f => f.file) : [m.blob];
    const entries = folder ? m.files.map(f => ({ path: f.path, size: f.file.size })) : [{ path: m.name, size: m.blob.size }];
    const core = createCore(m.module, {
      entries,
      read: (file, offset, into) => {
        const b = blobs[file];
        if (!b) return -1;
        const buf = new Uint8Array(reader.readAsArrayBuffer(b.slice(offset, offset + into.length)));
        into.set(buf);
        return buf.length;
      },
      linkTarget: () => null, // 브라우저는 링크 대상을 알 수 없다
    }, { onProgress: (stage, detail) => postMessage({ type: "progress", stage, detail }) });
    for (const text of m.rules) {
      const r = core.addRules(text);
      if (!r.ok) return postMessage({ type: "error", error: r.error });
    }
    const r = core.analyze(folder ? INPUT_FOLDER : INPUT_FILE, m.options);
    if (!r.ok) return postMessage({ type: "error", error: r.error });
    postMessage({ type: "result", json: r.bytes, memoryMB: core.memoryBytes() / 1e6 }, [r.bytes.buffer]);
    const f = core.finalizeRaw();
    if (!f.ok) return postMessage({ type: "final-error", error: f.error });
    postMessage({ type: "final", json: f.bytes }, [f.bytes.buffer]);
  } catch (e) {
    postMessage({ type: "error", error: { code: "E_INTERNAL", message: String(e && e.message || e) } });
  }
};
