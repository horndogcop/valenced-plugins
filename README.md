# Valenced Plugins by horndogcop

A collection of custom plugins for [Valenced](https://github.com/Valenced/valenced) (Discord mobile mod), built using the [`valenced-plugin-template`](https://github.com/Valenced/valenced-plugin-template) structure, with an automated GitHub Pages build pipeline.

> **Disclaimer:** This project was vibe-coded.

## Repository URL

Copy and add this repository URL in Valenced:

```text
https://horndogcop.github.io/valenced-plugins/index.json
```

## Plugins

### Hide User Content (`com.valenced.hide-user-content`)

Adds a user context menu entry to hide or blur images and optionally spoiler-wrap full message blocks from selected users, with a post-timestamp indicator to toggle displaying hidden images.

- [Hide User Content v1.0.0 (.zip)](https://horndogcop.github.io/valenced-plugins/pool/com.valenced.hide-user-content@1.0.0.zip)

### Mention Block (`com.valenced.mention-block`)

Intercepts `@user` and `#channel` mention autocomplete to hide blocked users and channels from suggestions, managed via message, channel, and profile context menus plus slash commands (`/mention-add`, `/mention-remove`, `/mention-list`).

- [Mention Block v1.0.0 (.zip)](https://horndogcop.github.io/valenced-plugins/pool/com.valenced.mention-block@1.0.0.zip)

### Negative Search Filters (`com.valenced.negative-search-filters`)

Adds repeatable client-side negative inline search filters (`-from:`, `-in:`, `-mentions:`, `-has:image`, `-has:embed`, `-has:attachment`, `-pinned:true`, etc.) that work both when typed inline and from the search filter menu, with no settings page.

- [Negative Search Filters v1.0.0 (.zip)](https://horndogcop.github.io/valenced-plugins/pool/com.valenced.negative-search-filters@1.0.0.zip)

## Automated Builds & GitHub Pages

1. Pushes to `main` automatically typecheck, bundle, and package every plugin into `pool/<id>@<version>.zip` and generate `index.json` + `index.html` on the `gh-pages` branch.
2. Once the repository is public, enable **Settings -> Pages -> Deploy from a branch -> `gh-pages` / `/ (root)`** to serve the repository index and plugin archives.

### Local Build Commands

```sh
cd valenced-plugin
bun install
bun run --bun lint:types
bun run --bun build
bun run --bun package
```
