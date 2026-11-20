"""Bake the four orthographic views of a small Kingfisher aquarium figure."""
import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import import_reconstruction
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('name')
parser.add_argument('--depth', type=float, default=.29, help='target depth as a fraction of length')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
folder = args.folder.resolve()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
fish = import_reconstruction(folder / 'shell-dense.glb', native_gltf=True)
coords = [v.co.copy() for v in fish.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
center, span = (hi+lo)/2, hi-lo
create_projectors(fish.data, coords, lo, span)

for vertex, p in zip(fish.data.vertices, coords):
    local = (p-center) / span.x
    local.y *= args.depth * span.x / span.y
    vertex.co = local
reduce = fish.modifiers.new('Reduce generated triangles', 'DECIMATE')
reduce.ratio = min(.82, 25500/len(fish.data.polygons))
bpy.ops.object.modifier_apply(modifier=reduce.name)
for face in fish.data.polygons:
    face.use_smooth = True
fish.name = args.name
paint = bpy.data.materials.new(args.name + ' · painted scales')
bake_reference_atlas(fish, paint, folder, size=640, basename='fish-color',
                     color=(.14, .26, .22, 1))
shader = paint.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .37
shader.inputs['Coat Weight'].default_value = .16
fish['Source'] = 'Hunyuan3D-2mv, four-view miniature'
remove_projectors(fish.data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'specimen.glb'), export_format='GLB',
                         export_yup=True, export_extras=True, export_vertex_color='NONE',
                         export_cameras=False, export_lights=False)
