"""Isolate the dominant cartridge silhouette on a flat studio reference."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, label


def foreground_rgba(image, *, neutral_background, threshold):
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
    mask = binary_fill_holes(components == largest)
    return Image.fromarray(np.dstack((rgb, mask * 255)).astype(np.uint8))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--crop-left', type=float, default=0, help='fraction of width to trim from a turnaround sheet')
    parser.add_argument('--threshold', type=int, default=24)
    args = parser.parse_args()
    with Image.open(args.input) as image:
        panel = image.crop((round(image.width * args.crop_left), 0, image.width, image.height))
        isolated = foreground_rgba(panel, neutral_background=True, threshold=args.threshold)
        isolated.crop(isolated.getbbox()).save(args.output)
