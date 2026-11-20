"""Reconstruct an isolated cartridge reference with TripoSR on the local GPU."""
import argparse
import importlib.machinery
import sys
import types
from pathlib import Path

import torch
from PIL import Image
from skimage.measure import marching_cubes
from reference_mask import foreground_rgba

parser = argparse.ArgumentParser()
parser.add_argument("image", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--resolution", type=int, default=192)
parser.add_argument("--neutral-background", action="store_true")
parser.add_argument("--keep-holes", action="store_true", help="retain larger enclosed background gaps in silhouettes")
parser.add_argument("--source", type=Path, help="checkout of the pinned TripoSR revision")
parser.add_argument("--weights", type=Path, help="directory containing config.yaml and model.ckpt")
args = parser.parse_args()
workspace = Path(__file__).resolve().parent
source = args.source or next(workspace.glob("TripoSR-*"))
sys.path.insert(0, str(source))

# TripoSR's optional segmentation path is unused for this studio reference.
sys.modules["rembg"] = types.ModuleType("rembg")
mc = types.ModuleType("torchmcubes")
mc.__spec__ = importlib.machinery.ModuleSpec("torchmcubes", None)


def extract_surface(field, level):
    vertices, faces, _, _ = marching_cubes(field.cpu().numpy(), level)
    return torch.from_numpy(vertices[:, ::-1].copy()), torch.from_numpy(faces.copy())


mc.marching_cubes = extract_surface
sys.modules["torchmcubes"] = mc
from tsr.system import TSR
from tsr.utils import resize_foreground

output = args.output.resolve()
with Image.open(args.image) as reference:
    rgba = foreground_rgba(reference, neutral_background=args.neutral_background,
                           threshold=24 if args.neutral_background else 25, keep_holes=args.keep_holes)
rgba.crop(rgba.getbbox()).save(output.with_suffix(".projection.png"))
cropped = resize_foreground(rgba, 0.85)
background = Image.new("RGBA", cropped.size, (128, 128, 128, 255))
cropped = Image.alpha_composite(background, cropped).convert("RGB")
cropped.save(output.with_suffix(".input.png"))

assert torch.cuda.is_available(), "CUDA unavailable"
torch.cuda.reset_peak_memory_stats()
print(torch.__version__, torch.cuda.get_device_name(0), flush=True)
model = TSR.from_pretrained(str(args.weights or workspace / "weights"), "config.yaml", "model.ckpt").eval().cuda()
model.renderer.set_chunk_size(8192)
with torch.inference_mode():
    code = model([cropped], device="cuda")
    result, = model.extract_mesh(code, has_vertex_color=True, resolution=args.resolution)
components = result.split(only_watertight=False)
result = max(components, key=lambda part: len(part.faces))
if result.volume < 0:
    result.invert()
result.export(output)
print(f"{len(result.faces):,} triangles, peak allocated CUDA {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB")
