#!/usr/bin/env node
// 명령 하나로 묶는다.
//   app-anatomy scan [--open] [폴더…]   이 맥에 설치된 앱을 모두 훑는다
//   app-anatomy <입력> [옵션…]          앱 파일 하나를 해석한다 (.app 폴더, .app이 든 ZIP, APK, IPA)
const sub = process.argv[2];
if (sub === "scan") { process.argv.splice(2, 1); await import("./scan.mjs"); }
else if (!sub || sub === "--help" || sub === "-h") {
  console.log(`app-anatomy: see what apps are made of. Nothing is uploaded; apps are read, never run.

  app-anatomy scan [--open] [dir]...   scan every app installed on this Mac
                                       --open shows the result in your browser (served from this machine only)
  app-anatomy <input> [--json <file>]  analyze one app: a .app folder, a ZIP with a .app, an APK or an IPA

  app-anatomy scan --help              options of scan`);
} else await import("./anatomy.mjs");
