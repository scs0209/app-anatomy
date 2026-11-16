---
name: app-anatomy
description: Find out what an app is made of and why it is the size it is, by measuring the real file with the app-anatomy CLI. Use this whenever someone asks what an app is built with (Electron, Flutter, React Native, native), why an app, APK, IPA or .app bundle is so large, which libraries or SDKs are inside it, what takes up the space, how two builds differ in size, or what the apps installed on their Mac are made of and how much disk duplicated runtimes waste. Use it even if they do not name the tool, as long as there is an app file, a build artifact or a Mac to look at. It measures; do not answer these from memory.
compatibility: Node.js 18 or newer and npx. Scanning a whole machine works on macOS only. Analyzing one file works wherever Node runs.
---

# app-anatomy

`app-anatomy` reads a shipped app and reports its parts with exact byte counts: the runtime, external libraries,
the app's own code, assets, and whatever it could not identify. It reads files and never runs the app. Nothing is
uploaded.

Answer from a measurement, not from what you remember about the app. Versions differ a lot, and people ask
precisely because the real number surprises them.

## Pick the mode

| The person has | Run |
|---|---|
| One app: a `.app` folder, a ZIP containing a `.app`, an `.apk`, an `.ipa` | single-app mode |
| "My Mac", "the apps I have installed", "how many Electron apps" | scan mode (macOS) |
| Two builds of the same app | single-app mode twice, then compare |

If they named an app but gave no file, look for it (`/Applications/Name.app` on a Mac, or a build output folder in
the project) before asking. Do not download an app from the internet to analyze unless they ask you to.

## Single app

```bash
npx --yes app-anatomy "<path>" --json /tmp/anatomy-result.json
node "<this skill's folder>/scripts/digest.mjs" /tmp/anatomy-result.json
```

The first command prints a four-line summary and writes the full result. The result can be several megabytes, so
do not read it directly. `digest.mjs` prints about 50 lines: size, runtime, largest parts with the same name merged
across copies, bytes by origin, and the largest unidentified parts. Pass `--top 25` for a longer list.

If the ZIP holds more than one app, the CLI stops with `E_MULTIPLE_APPS` and lists them; rerun with
`--app "<name>"`.

Need something the digest does not show (a specific library, everything under one folder)? Query the JSON with a
short script instead of printing it. Each node has `name`, `kind`, `bytes`, usually `origin`, and `children`; a
parent's bytes equal the sum of its children.

## Scan a Mac

```bash
npx --yes app-anatomy scan --out /tmp/this-mac.anatomy-scan.json
node "<this skill's folder>/scripts/digest.mjs" /tmp/this-mac.anatomy-scan.json
```

This reads every app in `/Applications` and `~/Applications` (add `--system` for `/System/Applications`, or pass
folders). It takes a few seconds for a couple of dozen apps.

The result lists the apps installed on this machine. Treat it as personal: keep it in a temporary folder, do not
commit it or paste the whole list anywhere, and say so if the person asks you to share it.

To show them the 3D view, run `npx --yes app-anatomy scan --open` instead. It starts a local page on `127.0.0.1`
and keeps running until stopped, so start it in the background or hand them the command.

## Reading the numbers

- **Sizes are uncompressed bytes.** An APK or IPA is smaller on the store than the total here. Say "uncompressed"
  when you quote a size.
- **Origin** says where a part came from: `runtime`, `library` (external), `app-code`, `bundled-app-code` (the
  app's own code as one bundle that was not broken down), `asset`, `unidentified`.
- **Unidentified means no rule names it yet**, not that it is suspicious or wasteful. Native Mac apps are mostly
  unidentified today. Report the identified percentage so the person knows how much of the picture is missing.
- **"×4" on a native library in an APK** means one copy per CPU type. A device installs one of them, so the
  per-device cost is roughly a quarter. The digest prints the per-CPU sizes when this applies.
- **The `runtime:` line of the CLI summary** counts everything inside the runtime's folder, which for React Native
  and Electron includes the app's own JavaScript. The "Bytes by origin" table counts the runtime itself. Quote the
  table when someone asks how big the runtime is.

## What you can and cannot conclude

You can say what takes the space, what the app is built with, and how many bytes a part accounts for.

You cannot say an app would still work without a part. Results made by version 0.2 or later record declared
dependencies (a node's `needs` lists the `id`s of nodes it says it requires: npm `dependencies`, a binary's needed
libraries, Electron app code needing the framework), so you can say "these parts declare they need X". That is not
the whole truth: code loaded by name at run time is not declared. "Removing X would save 40 MB" is fine as
arithmetic; "you can remove X" is not something this supports.
Suggest savings as things to investigate, and name the mechanism when there is a standard one (per-CPU splits or
app bundles for Android, a shared runtime is not an option for Electron apps, and so on).

## Comparing two builds

Run single-app mode on each with different output files, digest both, and compare the "Largest parts" and "Bytes by
origin" tables. For an exact per-part difference, write a short script that sums bytes by part name in each result
and prints the names whose totals changed, largest change first.

## Answering

Lead with the answer to what they asked, in one or two sentences with the numbers. Then a short table of the
largest parts (name, size, share, origin). Then anything that changes how the numbers should be read: the
identified percentage if it is well below 100, per-CPU copies, parts that were not looked inside. Keep the raw
digest out of the reply unless they ask for it.

**Example**

Asked "why is this APK 213 MB?", a good answer looks like:

> Uncompressed it is 226.7 MB, and 61% of that is third-party native libraries. The largest is WebRTC
> (`libjingle_peerconnection_so.so`), 43.1 MB across four CPU types. The React Native runtime is 17% and the app's
> own JavaScript bundle is 6.5%.
>
> | Part | Size | Share | Origin |
> |---|---|---|---|
> | libjingle_peerconnection_so.so ×4 | 43.1 MB | 19.0% | external library |
> | libreactnative.so ×4 | 26.3 MB | 11.6% | runtime |
> | … | | | |
>
> Native code is shipped once per CPU type (4 copies, about 180 MB together); a device installs one. 94% of bytes
> were identified.

## If something fails

- `E_UNSUPPORTED_FORMAT`: not a supported app file. A DMG has to be opened first and the `.app` inside passed.
- `E_LIMIT_EXCEEDED` or `E_TOO_LARGE`: the app has more parts than the tool handles in the time allowed. Say so
  rather than estimating.
- `npx` cannot reach the registry: the tool cannot be fetched. Tell the person; do not substitute a guess.
