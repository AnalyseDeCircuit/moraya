# Moraya DMG assets

`background.png` (660×400) and `background@2x.png` (1320×800) are the
DMG window background images Tauri's bundler drops behind the
Moraya.app icon and the Applications symlink when packaging the
macOS installer.

The whole reason this lives in the repo is to surface a heads-up at
the bottom of the install window:

> ▲ 安装完成后，请将此磁盘映像推出（右键 → 推出）
> Eject this disk image after installing.

Without it, users were leaving every old DMG mounted at `/Volumes/`,
and macOS LaunchServices would register the `.app` bundle inside each
one — the "Open With" menu sprouted one Moraya entry per previously
downloaded version.

## Regenerating

```bash
python3 src-tauri/dmg/generate-background.py
```

Requires Pillow (`pip3 install pillow`). The script is deterministic
and idempotent — commit both `background.png` and `background@2x.png`
afterwards so CI doesn't need Pillow.

If you edit the wording / colors / layout, edit
`generate-background.py` (the artwork is fully procedural — no
external design files), re-run the script, and visually sanity-check
the output before committing.

## Tauri wiring

`tauri.conf.json` references this background through
`bundle.macOS.dmg.background`. The `appPosition` and
`applicationFolderPosition` values there must match the icon slots
the background image expects (currently `x: 165, y: 200` for the
app, `x: 495, y: 200` for the Applications symlink).
