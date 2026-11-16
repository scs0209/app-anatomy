# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers who are curious what a shipped app is made of. They arrive from a link on GitHub, Hacker News or a social post, often after seeing a screenshot or short clip, and try it on an app they already know. Desk use, laptop or external monitor.

## Product Purpose

Drop an app file (.app folder, a ZIP containing a .app, an Android APK, an iOS IPA) and see what it is made of: the runtime (Electron, Flutter, React Native, native), external libraries, the app's own code and assets, with how many bytes each takes. The result is a 3D exploded view plus a list of the same parts. Success for a first-time visitor is wanting to try it on an app they know.

A command-line tool produces the same result as JSON.

## Positioning

It runs in the browser with nothing to install, and the file never leaves the device. One screen covers several platforms and runtimes, where existing tools cover one platform or one bundler and show a flat list or flat treemap.

## Operating Context

- Input by drag and drop or a file picker. Analysis runs in a Web Worker on a WebAssembly core.
- Results are also saved as JSON, shared as a 1200x630 card image, and browsed in a gallery of open-source apps.
- Narrow screens get a view-only 2D treemap.
- Screenshots of the result appear in READMEs and posts on both light and dark pages.

## Capabilities and Constraints

- Byte accounting is exact: a parent's bytes equal the sum of its children, measured as uncompressed size.
- One visual sign carries one meaning. Footprint area is bytes. Stacking height is the layer (app, runtime, library, module). Color is the origin, exactly four: the app's own code, external library, runtime, asset. Unidentified parts are gray with hatching, where hatching means "inside unknown". Overhead and shared bytes are a neutral gray. Transparency is not used. The 3D camera is orthographic.
- The result reveal is flat first, then the layers separate.
- No third-party requests of any kind: fonts and scripts are self-hosted, so fonts must allow redistribution in an open-source repository.
- English by default, Korean supported.
- One theme only: a dark board. There is no light theme (decided 2026-11-14). Screenshots placed on light pages are still dark images.
- Open source under Apache-2.0. A personal side project.
- Undecided: the product name ("App Anatomy" is a working name), the sample app shown on the first screen, and the adoption target.

## Brand Commitments

None yet. The name is a working name and there is no logo.

## Evidence on Hand

- Real analysis results for 12 open-source apps (Joplin, Mattermost Desktop, Standard Notes, LocalSend, AppFlowy, Immich, Mattermost Mobile, Rocket.Chat, Joplin Android, NewPipe, Maccy, UTM), with answer keys in `samples-answers/`.
- A working core, command-line tool and site shell (`core/`, `cli/`, `site/`).
- There are no users, testimonials, customer logos, download counts or benchmarks against other tools. Do not invent any.

## Product Principles

1. The exploded view is the product. A first-time visitor should remember an app coming apart into layers.
2. Never claim more than was measured. Unidentified stays visibly unidentified; parts not looked inside are marked as such.
3. One sign, one meaning. Nothing decorative may be mistaken for data.
4. The file stays on the device, and the interface says so where the user decides to drop it.

## Accessibility & Inclusion

Origin colors must stay distinguishable for color-blind viewers, and origin is never carried by color alone in the list. Keyboard access to the list and controls. Reduced-motion users get the result without the reveal animation.
