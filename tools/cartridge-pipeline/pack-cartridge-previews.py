"""Crop transparent previews while keeping the connector centered in X."""
import argparse
from pathlib import Path

from PIL import Image


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('renders', type=Path, nargs='+')
args = parser.parse_args()
args.folder.mkdir(parents=True, exist_ok=True)
for path in args.renders:
    with Image.open(path) as source:
        image = source.convert('RGBA')
    left, top, right, bottom = image.getchannel('A').point(lambda x: 255 if x > 14 else 0).getbbox()
    inset = max(0, min(left, image.width-right)-4)
    image = image.crop((inset, max(0, top-4), image.width-inset, min(image.height, bottom+4)))
    image.thumbnail((440, 405), Image.Resampling.LANCZOS)
    image.save(args.folder / (path.stem + '.webp'), quality=88, method=6)
