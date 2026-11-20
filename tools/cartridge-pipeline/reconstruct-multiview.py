"""Reconstruct a cartridge jointly from its four orthographic reference images."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch
from PIL import Image

from reference_mask import foreground_rgba

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--source', required=True, type=Path, help='checkout of Tencent-Hunyuan/Hunyuan3D-2')
parser.add_argument('--weights', required=True, type=Path, help='folder with config.yaml and model.fp16.safetensors')
conditioning_views = ('front', 'left', 'back', 'right')
reference_views = (*conditioning_views, 'top')
for view in reference_views:
    parser.add_argument('--' + view, required=True, type=Path)
parser.add_argument('--bottom', type=Path, help='underside projection for the reference bake')
parser.add_argument('--resolution', type=int, default=352)
parser.add_argument('--steps', type=int, default=12)
parser.add_argument('--seed', type=int, default=12345)
args = parser.parse_args()
if args.bottom:
    reference_views = (*reference_views, 'bottom')
if args.output.name == 'shell-dense.glb':
    parser.error('use a separate filename for the raw model, such as hunyuan-multiview.glb')

sys.path.insert(0, str(args.source.resolve()))
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

folder = args.output.resolve().parent
folder.mkdir(parents=True, exist_ok=True)
inputs = {}
hashes = {}
projections = {'front': 'shell-dense.projection.png', 'back': 'shell-rear.projection.png'}
for view in reference_views:
    path = getattr(args, view)
    hashes[view] = hashlib.sha256(path.read_bytes()).hexdigest()
    with Image.open(path) as image:
        masked = foreground_rgba(image, neutral_background=True, threshold=24, keep_holes=True)
    projection = masked.crop(masked.getbbox())
    projection.save(folder / projections.get(view, view + '.projection.png'))
    if view in conditioning_views:
        inputs[view] = projection

print('Conditioning views: ' + ', '.join(inputs), flush=True)
torch.cuda.reset_peak_memory_stats()
pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_single_file(
    str(args.weights / 'model.fp16.safetensors'), str(args.weights / 'config.yaml'),
    device='cuda', dtype=torch.float16, use_safetensors=True)
with torch.inference_mode():
    mesh, = pipeline(image=inputs, num_inference_steps=args.steps,
                     octree_resolution=args.resolution, num_chunks=12000,
                     generator=torch.manual_seed(args.seed), output_type='trimesh')
mesh.export(args.output)
body = max(mesh.split(only_watertight=False), key=lambda part: len(part.faces))
if body.volume < 0:
    body.invert()
body.export(folder / 'shell-dense.glb')
stats = {'views': hashes, 'conditioning_views': list(inputs), 'triangles': len(mesh.faces),
         'steps': args.steps, 'seed': args.seed,
         'resolution': args.resolution, 'gpu': torch.cuda.get_device_name(),
         'peak_allocated_gib': round(torch.cuda.max_memory_allocated()/2**30, 2),
         'main_component_triangles': len(body.faces)}
args.output.with_suffix('.json').write_text(json.dumps(stats, indent=2) + '\n', encoding='utf8')
print(json.dumps(stats, indent=2), flush=True)
