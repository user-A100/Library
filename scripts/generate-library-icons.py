from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "desktop" / "zotero" / "app"


def render(size: int) -> Image.Image:
    scale = size / 512
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(values):
        return tuple(round(value * scale) for value in values)

    draw.rounded_rectangle(box((24, 24, 488, 488)), radius=round(128 * scale), fill="#23865f")
    draw.polygon([box((154, 112)), box((230, 112)), box((230, 332)), box((380, 332)), box((380, 400)), box((154, 400))], fill="#ffffff")
    return image


base = render(512)
ico_path = APP / "win" / "zotero.ico"
base.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

for size in (32, 64, 128):
    render(size).save(APP / "linux" / "icons" / f"icon{size}.png")

connector_icons = ROOT / "connector" / "library-connector" / "icons"
if connector_icons.exists():
    for size in (16, 32, 64, 128):
        render(size).save(connector_icons / f"Icon-{size}.png")

print(ico_path)
