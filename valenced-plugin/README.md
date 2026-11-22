# Hide User Content (Valenced Plugin)

A plugin for [Valenced](https://github.com/Valenced/valenced) structured with [`valenced-plugin-template`](https://github.com/Valenced/valenced-plugin-template).

## Features

- **User Context Menu Action**: Adds **Hide User Content** / **Unhide User Content** to user action sheets and context menus.
- **Strict 3-Option Settings**:
  1. **Image Behavior**: `Hidden` or `Blurred`
  2. **Only in NSFW channels**: Toggle whether hiding applies only in NSFW-marked channels
  3. **Also hide message text**: Toggle between hiding images only or both images and text
- **Full-Block Spoiler Overlay** (when text + images are hidden):
  - Covers the entire message block background with a spoiler overlay.
  - Inline `||text spoilers||` and image taps remain interactive inside a revealed message.
  - Tapping whitespace inside a revealed message restores the spoiler overlay.
- **Post-Timestamp Indicator**:
  - Displays a subtle indicator icon right after the message timestamp (similar to Discord's `@silent` bell).
  - Tapping the indicator toggles displaying the image.

## Building

```sh
bun install
bun run build
```
