"""Bake the Hunyuan apartment furniture at the gallery's world scale."""

import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors


source, kind = sys.argv[sys.argv.index('--') + 1:]
folder = Path(source).resolve()
name, dimensions, roughness, metal = {
    'couch': ('ZANG apartment patchwork couch', (2.87, 1.14, 1.23), .89, 0),
    'tv': ('ZANG apartment television', (2.31, .71, 1.40), .57, .18),
}[kind]

bpy.ops.wm.read_factory_settings(use_empty=True)
prop = import_reconstruction(folder / 'hunyuan-multiview.glb', native_gltf=True)
prop.name = name
coords = [v.co.copy() for v in prop.data.vertices]
lo = Vector([min(v[i] for v in coords) for i in range(3)])
hi = Vector([max(v[i] for v in coords) for i in range(3)])
span = hi - lo
center = (lo + hi) / 2
center.z = lo.z
create_projectors(prop.data, coords, lo, span)
for v in prop.data.vertices:
    v.co = [(v.co[i] - center[i]) * dimensions[i] / span[i] for i in range(3)]
decimate = prop.modifiers.new('Web geometry budget', 'DECIMATE')
decimate.ratio = min(.9, 34000 / len(prop.data.polygons))
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in prop.data.polygons:
    face.use_smooth = True

material = bpy.data.materials.new(name + ' surfaces')
bake_reference_atlas(prop, material, folder, size=1536, basename=kind+'-atlas',
                     color=(.071, .053, .062, 1), face_priority=True)
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = roughness
shader.inputs['Metallic'].default_value = metal
prop['Source'] = 'Hunyuan3D-2mv, baked original orthographic references'
frame_asset(4.8)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / (kind + '.blend')))
remove_projectors(prop.data)
bpy.ops.export_scene.gltf(filepath=str(folder / (kind + '.glb')), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_lights=False, export_cameras=False)
