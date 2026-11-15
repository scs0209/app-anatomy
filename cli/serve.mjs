// 결과를 이 기기에서만 보이는 주소로 띄운다. 사이트 파일과 결과 파일을 127.0.0.1 에서만 내준다.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), siteDir = path.join(root, "site");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

export function serve({ scan }) {
  const rules = [];
  for (const dir of ["rules/builtin", "rules/imported"]) { const d = path.join(root, dir); if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith(".json")) rules.push(fs.readFileSync(path.join(d, f), "utf8")); }
  const fixed = new Map([["/anatomy_core.wasm", path.join(root, "dist/anatomy_core.wasm")], ["/loader.mjs", path.join(root, "host/loader.mjs")], ["/scan.json", scan]]);
  const server = http.createServer((req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(body); };
    try {
      const port = server.address().port, host = req.headers.host;
      // 다른 이름으로 이 서버를 부르는 요청(다른 사이트가 주소를 바꿔 접근하는 경우)은 받지 않는다
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(403, "text/plain", "forbidden");
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain", "method not allowed");
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p === "/") p = "/index.html";
      if (p === "/rules.json") return send(200, TYPES[".json"], JSON.stringify(rules));
      let file = fixed.get(p);
      if (!file) { file = path.join(siteDir, p); if (!file.startsWith(siteDir + path.sep)) return send(403, "text/plain", "forbidden"); } // 사이트 폴더 밖은 내주지 않는다
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, "text/plain", "not found");
      send(200, TYPES[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
    } catch { send(400, "text/plain", "bad request"); }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${server.address().port}/?open=scan.json`;
    console.log(`\nshowing the result at ${url}\n(served from this machine only; press Ctrl+C to stop)`);
    if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    resolve({ url, close: () => server.close() });
  }));
}
