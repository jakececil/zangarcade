"""Fit the multiview shell to the arcade's screen and cartridge dimensions."""

import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction
from material_zones import map_texture, pixels, smooth
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors


WIDTH, HEIGHT, DEPTH = 2.44, 1.45, .342
CENTER_Y = .11
SCREEN_Y = .08
SLOT_DEPTH = .008
folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)


def surface(name, color, roughness, metal=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    return material


def block(name, size, position, material=None, radius=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if radius:
        bevel = obj.modifiers.new('Molded edge radius', 'BEVEL')
        bevel.width = radius
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def cut(shell, name, size, position):
    cutter = block(name, size, position)
    cutter.select_set(False)
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    opening = shell.modifiers.new(name, 'BOOLEAN')
    opening.operation = 'DIFFERENCE'
    opening.solver = 'EXACT'
    opening.object = cutter
    bpy.ops.object.modifier_apply(modifier=opening.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


shell = import_reconstruction(folder / 'shell-dense.glb', native_gltf=True)
shell.name = 'ZANG Field Player · scarred charcoal housing'
coords = [vert.co.copy() for vert in shell.data.vertices]
lo = Vector([min(v[i] for v in coords) for i in range(3)])
hi = Vector([max(v[i] for v in coords) for i in range(3)])
span = hi - lo
center = (lo + hi) / 2
create_projectors(shell.data, coords, lo, span)
for vert in shell.data.vertices:
    vert.co = tuple((vert.co[i] - center[i]) / span[i] * length
                    for i, length in enumerate((WIDTH, DEPTH, HEIGHT)))
    vert.co.z += CENTER_Y

reduction = shell.modifiers.new('Web geometry budget', 'DECIMATE')
reduction.ratio = min(.9, 34000 / len(shell.data.polygons))
bpy.ops.object.modifier_apply(modifier=reduction.name)
for face in shell.data.polygons:
    face.use_smooth = True

finish = bpy.data.materials.new('Scuffed ABS, adhesive and anodized hardware')
atlas = bake_reference_atlas(shell, finish, folder, size=1536, basename='field-player-albedo',
                             color=(.042, .048, .052, 1), face_priority=True)
linear = np.clip(pixels(atlas)[..., :3], 0, 1)
rgb = linear ** (1 / 2.2)
r, g, b = np.moveaxis(rgb, -1, 0)
bright = .24 * r + .65 * g + .11 * b
adhesive = smooth(.08, .26, g - b) * smooth(.15, .48, r)
scuff = smooth(.20, .48, bright) * (1 - adhesive)
roughness = np.clip(.52 + .25 * adhesive + .16 * scuff, .38, .87)
metallic = (.08 + .33 * scuff) * (1 - adhesive)
nodes, links = finish.node_tree.nodes, finish.node_tree.links
shader = nodes.get('Principled BSDF')
channels = nodes.new('ShaderNodeSeparateColor')
finish_map = map_texture(nodes, folder, 'field-player-finish.png',
                         'ABS and hardware roughness / metal',
                         np.stack((np.zeros_like(roughness), roughness, metallic), axis=-1))
links.new(finish_map.outputs['Color'], channels.inputs[0])
links.new(channels.outputs['Green'], shader.inputs['Roughness'])
links.new(channels.outputs['Blue'], shader.inputs['Metallic'])
shader.inputs['Coat Weight'].default_value = .095
shader.inputs['Coat Roughness'].default_value = .34

# The front is a true opening sized for 240:160. The upper port is cut into
# the recovered shell at the shared slot axis so the connectors can seat.
cut(shell, 'Recess for the 3:2 display', (1.469, .50, .981), (0, -.022, SCREEN_Y))
cut(shell, 'Cartridge slot pocket', (.452, .154, .248), (0, SLOT_DEPTH, .816))
edge = surface('Blackened bezel lip', (.013, .017, .018), .4, .23)
liner = surface('Screen tunnel and contact port', (.004, .0055, .007), .66)
contact = surface('Worn brass slot guides', (.34, .22, .081), .41, .69)

for z in (SCREEN_Y - .496, SCREEN_Y + .496):
    block('Display bezel horizontal', (1.513, .035, .029), (0, -.130, z), edge, .007)
for x in (-.739, .739):
    block('Display bezel upright', (.034, .035, .965), (x, -.130, SCREEN_Y), edge, .007)
block('Recessed screen backing', (1.467, .046, .979), (0, -.053, SCREEN_Y), liner, .006)

block('Slot bottom', (.437, .142, .032), (0, SLOT_DEPTH, .701), liner, .005)
for y in (SLOT_DEPTH - .082, SLOT_DEPTH + .082):
    block('Slot guide', (.458, .016, .030), (0, y, .760), edge, .005)
for x in (-.206, .206):
    block('Slot contact shoulder', (.019, .090, .024), (x, SLOT_DEPTH, .745), contact, .004)

shell['Source'] = 'Hunyuan3D-2mv geometry; six ImageGen orthographic color projections'
shell['Screen aperture'] = '1.440 x 0.960 at X 0, Y-up 0.080'
shell['Connector'] = 'Centered ZANG edge-card slot, +Z front'
frame_asset(3.6)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'zang-field-player.blend'))
remove_projectors(shell.data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'zang-field-player.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_lights=False, export_cameras=False)
