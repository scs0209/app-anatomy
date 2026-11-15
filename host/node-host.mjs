// Node용 호스트. 동기 파일 읽기와 실제 링크 정보를 준다.
import fs from "node:fs";
import path from "node:path";

export function fileSource(file) {
  const fd = fs.openSync(file, "r");
  return {
    entries: [{ path: path.basename(file), size: fs.fstatSync(fd).size }],
    read: (_file, offset, into) => fs.readSync(fd, into, 0, into.length, offset),
    linkTarget: () => null,
    close: () => fs.closeSync(fd),
  };
}

export function folderSource(root) {
  const base = path.dirname(root), entries = [], full = [], fds = new Map();
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) { entries.push({ path: path.relative(base, p).split(path.sep).join("/"), size: 0, link: true }); full.push(p); }
      else if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { entries.push({ path: path.relative(base, p).split(path.sep).join("/"), size: fs.statSync(p).size }); full.push(p); }
    }
  }
  return {
    entries,
    read: (file, offset, into) => {
      let fd = fds.get(file);
      if (fd === undefined) { fd = fs.openSync(full[file], "r"); fds.set(file, fd); }
      const n = fs.readSync(fd, into, 0, into.length, offset);
      if (fds.size > 200) { for (const f of fds.values()) fs.closeSync(f); fds.clear(); }
      return n;
    },
    linkTarget: file => { try { return fs.readlinkSync(full[file]); } catch { return null; } },
    close: () => { for (const f of fds.values()) fs.closeSync(f); fds.clear(); },
  };
}
