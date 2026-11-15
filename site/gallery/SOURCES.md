# Gallery sources

Checked on 2026-11-15 through the GitHub API.

- `repo`, `source`: the project's source repository.
- `release`: the release page the analyzed file was downloaded from. Each file name was found among that release's assets.
- `license`: for `licenseBasis: "github"`, the SPDX id GitHub shows for the repository (GitHub does not distinguish "-only" from "-or-later"). For `licenseBasis: "file"`, read from the repository's LICENSE file because GitHub shows no id.
- Joplin: the repository's LICENSE file says all code is AGPL-3.0-or-later unless a directory has its own LICENSE; `packages/app-desktop` and `packages/app-mobile` have none. Android builds are published in `laurent22/joplin-android`, which holds releases only.

The license is the project's own license for its source. Third-party components inside each app carry their own licenses. The gallery publishes measurements of the released files (names and sizes of parts), not the files themselves. App names belong to their owners; this project is not affiliated with them.
