# App Anatomy

See what the apps on your Mac are made of.

```bash
npx app-anatomy scan --open
```

It reads every app in `/Applications` and `~/Applications`, works out the runtime (Electron, Flutter, React Native, native), the libraries, the app's own code and the assets, counts the bytes, and shows the result in your browser as a chip opened into layers. The first line tells you things like how many copies of Electron you have installed and how much disk they take together.

Nothing is uploaded. Apps are read, never run. The result page is served from your own machine.

> Status: early. "App Anatomy" is a working name.

## One app

```bash
npx app-anatomy path/to/Some.app
npx app-anatomy some.apk --json result.json
```

Inputs: a `.app` folder, a ZIP containing a `.app`, an Android APK, an iOS IPA. The site (`site/`) does the same in the browser by drag and drop, with a 3D view, a list, search, a share card and a gallery of open-source apps.

## How to read it

- Area is bytes. Height is the layer: app, runtime, library, module. Color is where a part came from: runtime, external library, the app's own code, asset.
- Gray with hatching means unidentified. Hatching on a color means "we know whose it is but did not look inside".
- A parent's bytes always equal the sum of its children.

## What it cannot do yet

- Scanning a whole machine works on macOS only.
- Native apps are mostly unidentified: a rule has to exist for a library to be recognized. On the author's Mac 31% of all bytes were identified.
- Encrypted iOS apps show structure only.

## Contributing rules

Unidentified parts are the gray hatched blocks. A rule that names one is a few lines of JSON, and you only need Node to write and test it. [CONTRIBUTING.md](CONTRIBUTING.md) walks through a real one: one rule took Rocket.Chat's Android app from 90.9% to 94.0% identified.

## Layout

| Path | What |
|---|---|
| `core/` | the analyzer, Rust compiled to WebAssembly (`sh core/build-wasm.sh`) |
| `cli/` | the command-line tool |
| `site/` | the static site |
| `rules/` | identification rules |
| `schema/` | the result format |

## License

Apache-2.0. Third-party material is listed in `NOTICE`.
