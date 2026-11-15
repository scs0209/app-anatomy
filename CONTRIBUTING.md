# Contributing a rule

The gray hatched blocks are parts nobody has named yet. A rule names one. It is a few lines of JSON, and you do not need Rust or a build step: Node 18 or newer is enough.

A worked example, start to finish. Rocket.Chat's Android app had a 7.0 MB library the tool did not recognize. One rule later, identified bytes went from 90.9% to 94.0%.

## 1. Find something unidentified

```bash
git clone https://github.com/scs0209/app-anatomy && cd app-anatomy
node rules/tools/unidentified.mjs path/to/app.apk
```

The input can be an app file (`.app` folder, ZIP with a `.app`, APK, IPA) or a result JSON, including the ones in `site/gallery/`. It prints the largest unidentified parts, merged by name:

```
android-release.apk: 20.7 MB unidentified of 226.7 MB (9.1%), 85 distinct names

    7.0 MB    3.1%  ×4 libwatermelondb-jsi.so   (in android-release.apk > arm64-v8a)
                     try: file-name literal "libwatermelondb-jsi.so"
```

The `try:` line is a guess from the file name. You still have to find out what the part is: search the name, find the project it belongs to, and make sure the name is specific to that project.

## 2. Write the rule

Add an entry to `rules/builtin/builtin.json`:

```json
{
 "id": "lib.watermelondb",
 "name": "WatermelonDB",
 "kind": "library",
 "category": "other",
 "homepage": "https://github.com/Nozbe/WatermelonDB",
 "match": [
  { "target": "file-name", "type": "literal", "value": "libwatermelondb-jsi.so", "packaging": ["apk"] }
 ]
}
```

- `id`: lowercase letters, digits, `.`, `_`, `-`. Existing ids start with `lib.` or `dex.`. **Rules must stay sorted by `id`** (byte order); the check fails otherwise.
- `name`: what people call it. This is what shows on the block.
- `kind`: `library`. (`runtime` is for Electron, Flutter and the like; those are handled in the analyzer, not by rules.)
- `category`: one of `ads`, `analytics`, `payment`, `ui`, `network`, `other`.
- `homepage`: optional, `https:` only.
- `match`: one or more conditions. The rule matches if any of them does.
- `packaging`: optional. Limit a condition to `apk`, `ipa` or `macos-app` when the name only means this library there.

### Conditions

| `target` | Compared with | `type` | Use it for |
|---|---|---|---|
| `file-name` | the last part of a path | `literal`, `prefix`, `glob` | native libraries: `libfoo.so`, `libfoo.*.so` |
| `framework-name` | a framework's name without `.framework` | `literal`, `prefix` | iOS and macOS frameworks |
| `path` | the path from the app's root | `literal`, `prefix`, `glob` | a folder that belongs to one library |
| `dex-class` | a class name written `com/example/Foo` | `literal`, `prefix` | Android Java and Kotlin code |
| `npm-package` | the name in a `package.json` | `literal` | JavaScript packages in Electron apps |
| `string-marker` | a string inside a file | `literal` | **accepted by the format but not applied yet** |

Limits, all enforced by the check:

- No regular expressions.
- A glob uses `*` only: at most two, never `**`, `*` does not cross `/`, and at least 3 fixed characters.
- A `path` or `dex-class` prefix ends with `/` (`com/google/` does not match `com/googlex/`).
- Values are case sensitive.

Prefer the most certain condition you can: `npm-package` (the package says its own name) over a `dex-class` prefix over a file name. A match from `npm-package` is reported with high confidence, the others with medium.

## 3. Check and try it

```bash
node rules/tools/check.mjs
node cli/main.mjs path/to/app.apk
node rules/tools/unidentified.mjs path/to/app.apk
```

`check.mjs` validates every rule file and reports the first problem, for example:

```
E_RULES_INVALID: rule file builtin: 1 problem(s); first: (file): rules are not sorted by id (byte order), or an id appears twice
E_RULES_INVALID: rule file builtin: 1 problem(s); first: dex.androidx: match[0]: a path or class prefix must end with `/`
```

Then run the app again. The part should be gone from the unidentified list, and the summary line should move:

```
identified 94.0% · not looked inside 6.5% · overhead 2.8%
```

To see it on the chip: `node cli/main.mjs path/to/app.apk --json result.json`, then drop `result.json` on the site (`site/README.md` says how to run it locally).

## 4. Open a pull request

In the description, say:

- which app and version you tried it on, and where to download it
- the identified percentage before and after
- how you know the name belongs to that library (a link is enough)

Checklist:

- [ ] `node rules/tools/check.mjs` passes
- [ ] the rule matches in a real app, not only in theory
- [ ] the value is specific: it would not match an unrelated library
- [ ] you did not edit `rules/imported/` (see below)
- [ ] you did not regenerate `site/gallery/*.json`; a maintainer refreshes the gallery after rules change

## What not to add

- **An app's own code.** A rule names a library that many apps could contain. `librust_lib_localsend_app.so` is LocalSend's own code and should stay unidentified until the analyzer can say "app code" on its own.
- **Guesses.** If you cannot tell what a file is, leave it. Unidentified is an honest answer.
- **Names that are too short or too common** (`libutil.so`, `common/`). They will mislabel other apps.

## Where rules come from, and licenses

- `rules/builtin/builtin.json` is this project's own file, Apache-2.0. Your contribution goes here and is licensed the same way.
- `rules/imported/libchecker-rules.json` is converted from [LibChecker-Rules](https://github.com/LibChecker/LibChecker-Rules) (Apache-2.0) by `rules/tools/convert-libchecker.py`. Do not edit it by hand: fix the rule upstream, or add a rule to the built-in file.
- Write rules from what you observe in apps and from the libraries' own documentation. **Do not copy entries from another detection database** unless its license allows it and you say so in the pull request. Some well-known ones cannot be mixed in here: Exodus Privacy's tracker data is ODbL, MobSF is GPL-3.0, and LibScout's profiles have no license.

## Other ways to help

- Try the tool on an app and report what looks wrong: a part named incorrectly is worse than a part not named.
- `rules/README.md` (Korean) has the full format notes and the decisions behind it.

The analyzer itself is in `core/` (Rust, built with `sh core/build-wasm.sh`). Changes there are welcome too, but open an issue first so we can agree on the approach.
