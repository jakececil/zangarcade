"""Pack the two Cabinet print sheets and housing textures for the hex drum."""

import argparse
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('cover', type=Path)
args = parser.parse_args()
folder = args.folder

# The drawn dividers are slightly off the nominal thirds in each print.
sheets = [Image.open(folder / f'print-{i}.png').convert('RGB') for i in [1, 2]]
horizontal = [(0, .332, .665, 1), (0, .336, .672, 1)]
vertical = [(0, .311, .648, 1), (0, .331, .667, 1)]
columns = [(0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (0, 0)]
tile_w, tile_h = 320, 192
atlas = Image.new('RGB', (tile_w * len(columns), tile_h * 3))
for side, (sheet, column) in enumerate(columns):
    source = sheets[sheet]
    x, y = horizontal[sheet], vertical[sheet]
    for row in range(3):
        bounds = (round((x[column] + .005) * source.width), round((y[row] + .007) * source.height),
                  round((x[column+1] - .005) * source.width), round((y[row+1] - .007) * source.height))
        # A drum face is wider than the corresponding printed panel.
        # Preserve the specimen's proportions by extending the painted wall.
        inset = 38
        tile = source.crop(bounds).resize((tile_w - 2 * inset, tile_h), Image.Resampling.LANCZOS)
        left = side * tile_w
        top = row * tile_h
        atlas.paste(ImageOps.mirror(tile.crop((0, 0, inset, tile_h))), (left, top))
        atlas.paste(tile, (left + inset, top))
        atlas.paste(ImageOps.mirror(tile.crop((tile.width-inset, 0, tile.width, tile_h))),
                    (left + tile_w - inset, top))
atlas.save(folder / 'specimen-face-atlas.jpg', quality=92, subsampling=0, optimize=True)

cover = Image.open(args.cover).convert('RGB').resize((380, 476), Image.Resampling.LANCZOS)
cover.crop((17, 17, 363, 142)).save(folder / 'title.jpg', quality=94, subsampling=0)

rng = random.Random(8308)
dim = 512
fine = Image.effect_noise((dim, dim), 23).point(lambda p: .40 * p + 76)
blotches = Image.new('L', (38, 38))
blotches.putdata([rng.randrange(68, 190) for _ in range(38**2)])
weathering = ImageChops.multiply(fine, blotches.resize((dim, dim), Image.Resampling.BICUBIC))
iron = Image.merge('RGB', tuple(weathering.point(lambda v: min(255, v * m + b))
                                for m, b in [(1.08, 32), (.62, 12), (.62, 24)]))
draw = ImageDraw.Draw(iron)
for _ in range(490):
    x, y = rng.randrange(dim), rng.randrange(dim)
    length = rng.randrange(1, 21)
    rust = rng.randrange(62, 146)
    draw.line((x, y, x + length, y - length // 6), fill=(rust, int(rust*.66), int(rust*.44)))
iron.save(folder / 'oxide.jpg', quality=90, optimize=True)
