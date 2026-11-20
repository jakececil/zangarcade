"""Isolate the dominant cartridge silhouette on a flat studio reference."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, label


def foreground_rgba(image, *, neutral_background, threshold, keep_holes=False):
    rgb = np.asarray(image.convert('RGB'), dtype=np.int16)
    if neutral_background:
        border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]))
        neutral = np.median(border, axis=0)
        foreground = np.max(np.abs(rgb - neutral), axis=2) > threshold
    else:
        foreground = (rgb.max(axis=2) - rgb.min(axis=2)) > threshold
    components, count = label(foreground)
    if not count:
        raise ValueError('No foreground found. Check the studio background and mask threshold.')
    largest = np.bincount(components.ravel())[1:].argmax() + 1
    silhouette = components == largest
    mask = binary_fill_holes(silhouette)
    if keep_holes:
        gaps, _ = label(mask & ~silhouette)
        sizes = np.bincount(gaps.ravel())
        sizes[0] = 0
        mask &= sizes[gaps] < max(64, mask.size*.0005)
    return Image.fromarray(np.dstack((rgb, mask * 255)).astype(np.uint8))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--crop-left', type=float, default=0, help='fraction of width to trim from a turnaround sheet')
    parser.add_argument('--threshold', type=int, default=24)
    parser.add_argument('--keep-holes', action='store_true', help='retain larger enclosed background gaps in silhouettes')
    args = parser.parse_args()
    with Image.open(args.input) as image:
        panel = image.crop((round(image.width * args.crop_left), 0, image.width, image.height))
        isolated = foreground_rgba(panel, neutral_background=True, threshold=args.threshold, keep_holes=args.keep_holes)
        isolated.crop(isolated.getbbox()).save(args.output)
