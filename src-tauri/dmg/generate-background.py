#!/usr/bin/env python3
"""
Generate the Moraya DMG background image.

Re-run this whenever the wording / layout changes. The output is committed
(`background.png` + the @2x retina file) so the bundle build doesn't need
this script available at CI time — only when an editor wants to refresh
the artwork.

Why bother with a custom background:
The default Tauri DMG is just an icon + Applications symlink, with no
hint that the disk image should be ejected after the install. Users
were leaving stale 0.29 / 0.39 DMGs mounted at /Volumes, and macOS
LaunchServices registered every `.app` it found inside them — so the
"Open With" menu sprouted one Moraya entry per version. The dominant
visual element here is therefore the eject reminder at the bottom.
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# 1x dimensions; Tauri's create-dmg consumes the 1x file and macOS
# auto-uses the @2x variant when present alongside it.
#
# Height history:
#   • 400, 420, 470 (with matching windowSize) → bottom hint clipped:
#     Finder draws its title bar with the volume name + traffic-light
#     controls OVER the content area, eating ~46 px that
#     `windowSize.height` does NOT compensate for.
#   • 380 + windowSize=480 → hint visible but a 54 px white folder
#     background strip appeared below the image (Finder's default
#     folder bg is pure white, not the soft #F0F0F2 my gradient
#     bottoms out at).
#   • CURRENT: 434 + windowSize=480. The image is sized to fill the
#     VISIBLE content area exactly (windowSize.height − Finder chrome
#     of ~46 px), so the entire window reads as one continuous panel.
W, H = 660, 434
DPI_SCALE = 2  # produce @2x retina file too

ASSETS_DIR = Path(__file__).resolve().parent
OUT_1X = ASSETS_DIR / 'background.png'
OUT_2X = ASSETS_DIR / 'background@2x.png'

# Font candidates — first hit wins on each platform.
LATIN_FONT_CANDIDATES = [
    '/System/Library/Fonts/SFNS.ttf',          # macOS modern
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/HelveticaNeue.ttc',
]
CJK_FONT_CANDIDATES = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
]


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render(scale: int, out_path: Path) -> None:
    w, h = W * scale, H * scale
    # Solid pure-white fill. Originally a subtle gradient (#FAFAFB →
    # #F0F0F2), but Finder paints the default folder background in
    # pure white outside the explicit image area — and on smaller
    # displays / different macOS versions a thin band of that folder
    # bg may peek through at the bottom. Matching to #FFFFFF makes
    # any such seam invisible.
    img = Image.new('RGB', (w, h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    title_font = load_font(LATIN_FONT_CANDIDATES, 22 * scale)
    arrow_font = load_font(LATIN_FONT_CANDIDATES, 56 * scale)
    hint_font_cn = load_font(CJK_FONT_CANDIDATES, 15 * scale)
    hint_font_en = load_font(LATIN_FONT_CANDIDATES, 12 * scale)
    sub_font_cn = load_font(CJK_FONT_CANDIDATES, 11 * scale)

    # ── Title row ─────────────────────────────────────────
    title = 'Install Moraya'
    tw = draw.textlength(title, font=title_font)
    draw.text(
        ((w - tw) / 2, 30 * scale),
        title,
        font=title_font,
        fill=(40, 40, 45),
    )

    # ── Drag arrow between the two icon slots ─────────────
    # Tauri's `appPosition` and `applicationFolderPosition` (set in
    # tauri.conf.json) drop the actual icons over the background, so
    # this just paints the connector between them. The arrow Y must
    # match the icon center configured in tauri.conf.json — currently
    # `y: 200`.
    arrow_y = 200 * scale
    draw.text(
        ((w / 2) - 28 * scale, arrow_y - 36 * scale),
        '→',
        font=arrow_font,
        fill=(150, 150, 160),
    )

    drag_hint = 'Drag Moraya into the Applications folder'
    dw = draw.textlength(drag_hint, font=hint_font_en)
    draw.text(
        ((w - dw) / 2, 280 * scale),
        drag_hint,
        font=hint_font_en,
        fill=(110, 110, 120),
    )

    # ── Eject reminder at the bottom ──────────────────────
    # No coloured band. The original amber strip felt too "alert" for
    # what is just a helpful nudge, and the saturated yellow clashed
    # with the otherwise quiet install window. Instead: a hair-thin
    # neutral separator above two centred lines in soft grey. The
    # message still reads as a heads-up because of position + the
    # separator, without shouting.
    sep_y = h - 60 * scale
    draw.line(
        [(80 * scale, sep_y), (w - 80 * scale, sep_y)],
        fill=(220, 220, 224),
        width=max(1, scale),
    )

    cn = '安装完成后，请将此磁盘映像推出（右键 → 推出）'
    en = 'Eject this disk image after installing.'
    cnw = draw.textlength(cn, font=hint_font_cn)
    enw = draw.textlength(en, font=sub_font_cn)

    cn_y = sep_y + 12 * scale
    draw.text(((w - cnw) / 2, cn_y), cn, font=hint_font_cn, fill=(110, 110, 118))

    en_y = cn_y + 22 * scale
    draw.text(((w - enw) / 2, en_y), en, font=sub_font_cn, fill=(150, 150, 158))

    img.save(out_path, 'PNG', optimize=True)
    print(f'✓ wrote {out_path}  ({w}×{h})')


if __name__ == '__main__':
    render(1, OUT_1X)
    render(DPI_SCALE, OUT_2X)
