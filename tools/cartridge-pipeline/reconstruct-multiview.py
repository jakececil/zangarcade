"""Reconstruct a cartridge jointly from its four orthographic reference images."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

from reference_mask import foreground_rgba

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--source', type=Path, help='checkout of Tencent-Hunyuan/Hunyuan3D-2')
parser.add_argument('--weights', type=Path, help='folder with config.yaml and model.fp16.safetensors')
parser.add_argument('--projections-only', action='store_true',
                    help='rebake references using the existing four-view reconstruction')
conditioning_views = ('front', 'left', 'back', 'right')
for view in conditioning_views:
    parser.add_argument('--' + view, required=True, type=Path)
parser.add_argument('--top', type=Path, help='top projection for the reference bake')
parser.add_argument('--bottom', type=Path, help='underside projection for the reference bake')
parser.add_argument('--resolution', type=int, default=352)
parser.add_argument('--steps', type=int, default=12)
parser.add_argument('--seed', type=int, default=12345)
parser.add_argument('--mask-threshold', type=int, default=24,
                    help='RGB contrast required to separate the cartridge from the studio background')
parser.add_argument('--solid-silhouette', action='store_true',
                    help='fill low-contrast areas inside a closed cartridge outline')
args = parser.parse_args()
reference_views = (*conditioning_views, *(view for view in ('top', 'bottom') if getattr(args, view)))
if args.output.name == 'shell-dense.glb':
    parser.error('use a separate filename for the raw model, such as hunyuan-multiview.glb')
if not args.projections_only and (not args.source or not args.weights):
    parser.error('--source and --weights are required for reconstruction')

folder = args.output.resolve().parent
folder.mkdir(parents=True, exist_ok=True)
manifest = args.output.with_suffix('.json')
hashes = {view: hashlib.sha256(getattr(args, view).read_bytes()).hexdigest() for view in reference_views}
if args.projections_only:
    if not all(path.is_file() for path in (manifest, args.output, folder / 'shell-dense.glb')):
        parser.error('--projections-only requires an existing reconstruction and manifest')
    stats = json.loads(manifest.read_text(encoding='utf8'))
    if any(stats['views'].get(view) != hashes[view] for view in conditioning_views):
        parser.error('a conditioning view changed and requires a new reconstruction')

inputs = {}
projections = {'front': 'shell-dense.projection.png', 'back': 'shell-rear.projection.png'}
for view in reference_views:
    path = getattr(args, view)
    with Image.open(path) as image:
        masked = foreground_rgba(image, neutral_background=True, threshold=args.mask_threshold,
                                 keep_holes=not args.solid_silhouette)
    projection = masked.crop(masked.getbbox())
    projection.save(folder / projections.get(view, view + '.projection.png'))
    if view in conditioning_views:
        inputs[view] = projection
if args.projections_only:
    stats['views'].update(hashes)
    manifest.write_text(json.dumps(stats, indent=2) + '\n', encoding='utf8')
    print('Refreshed projections for the existing reconstruction.', flush=True)
    sys.exit(0)

import torch
sys.path.insert(0, str(args.source.resolve()))
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

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
manifest.write_text(json.dumps(stats, indent=2) + '\n', encoding='utf8')
print(json.dumps(stats, indent=2), flush=True)
