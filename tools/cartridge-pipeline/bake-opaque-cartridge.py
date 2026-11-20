"""Fit and bake a generated opaque cartridge, with a replaceable printed label."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction, smoothstep

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('slug')
parser.add_argument('--shell-width', type=float, default=.501)
parser.add_argument('--shell-height', type=float, default=.321)
parser.add_argument('--shell-depth', type=float, default=.099)
parser.add_argument('--native-gltf', action='store_true', help='input mesh already uses glTF axes')
parser.add_argument('--yaw', type=float, default=0, help='input yaw adjustment in degrees')
parser.add_argument('--candy-graft-material', action='store_true', help='metal pins and localized roughness for candy graft shells')
parser.add_argument('--label-width', type=float, required=True)
parser.add_argument('--label-height', type=float, required=True)
parser.add_argument('--label-x', type=float, default=0)
parser.add_argument('--label-y', type=float, required=True, help='label center height in GLB coordinates')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
folder = args.folder.resolve()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
shell = import_reconstruction(folder / 'shell-dense.glb', native_gltf=args.native_gltf)
if args.yaw:
    shell.data.transform(Matrix.Rotation(math.radians(args.yaw), 4, 'Z'))
shell.name = args.slug + ' · reconstructed shell'
coords = [v.co.copy() for v in shell.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
span = hi - lo
center = (hi + lo) / 2
toe = [v.x for v in coords if lo.z < v.z < lo.z + .064*span.z]
seat_center = (min(toe) + max(toe)) / 2

front_name, rear_name = 'Front reference', 'Rear reference'
left_name, right_name = 'Left reference', 'Right reference'
top_name = 'Top reference'
projector_uvs = (front_name, rear_name, left_name, right_name, top_name)
for name in projector_uvs:
    shell.data.uv_layers.new(name=name)
front, rear, left, right, top = (shell.data.uv_layers[name] for name in projector_uvs)
for loop in shell.data.loops:
    x, y, z = coords[loop.vertex_index]
    u, depth, v = (x-lo.x)/span.x, (y-lo.y)/span.y, (z-lo.z)/span.z
    front.data[loop.index].uv = (u, v)
    rear.data[loop.index].uv = (1-u, v)
    left.data[loop.index].uv = (1-depth, v)
    right.data[loop.index].uv = (depth, v)
    top.data[loop.index].uv = (u, depth)

# Preserve the shell's lean and asymmetry. The bottom of the recovered part
# defines the connector center. Only the lower strip is constrained to the slot.
for vertex, (x, y, z) in zip(shell.data.vertices, coords):
    fraction = (z-lo.z)/span.z
    x = (x-seat_center)*args.shell_width/span.x
    y = (y-center.y)*args.shell_depth/span.y
    z = -.143 + fraction*args.shell_height
    seat = 1-smoothstep(.17, .34, fraction)
    x += (min(.157, max(-.157, x))-x)*seat
    y += (min(.030, max(-.030, y))-y)*seat
    vertex.co = (x, y, z)
source_faces = len(shell.data.polygons)
decimate = shell.modifiers.new('Reduce generated triangles', 'DECIMATE')
decimate.ratio = min(.78, 135000/source_faces)
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in shell.data.polygons:
    face.use_smooth = True
paint = shell.data.color_attributes.active_color
atlas = shell.data.uv_layers.new(name='Baked shell UV')
shell.data.uv_layers.active = atlas
atlas.active_render = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.10, island_margin=.010, correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')

material = bpy.data.materials.new('Worn specimen carapace')
material.use_nodes = True
shell.data.materials.clear()
shell.data.materials.append(material)
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
output = nodes.get('Material Output')
if paint:
    base_color = nodes.new('ShaderNodeVertexColor')
    base_color.layer_name = paint.name
else:
    base_color = nodes.new('ShaderNodeRGB')
    base_color.outputs[0].default_value = (.029, .072, .089, 1)
normal = nodes.new('ShaderNodeNewGeometry').outputs['Normal']


def project(image, layer, direction, previous, *, side=False):
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(image))
    texture.image.pack()
    texture.extension = 'CLIP'
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = layer
    links.new(uv.outputs[0], texture.inputs['Vector'])
    facing = nodes.new('ShaderNodeVectorMath')
    facing.operation = 'DOT_PRODUCT'
    facing.inputs[1].default_value = direction
    links.new(normal, facing.inputs[0])
    weight = nodes.new('ShaderNodeMapRange')
    weight.interpolation_type = 'SMOOTHSTEP'
    weight.inputs['From Min'].default_value = .36 if side else .10
    weight.inputs['From Max'].default_value = .89 if side else .68
    links.new(facing.outputs['Value'], weight.inputs['Value'])
    coverage = nodes.new('ShaderNodeMath')
    coverage.operation = 'MULTIPLY'
    links.new(weight.outputs[0], coverage.inputs[0])
    links.new(texture.outputs['Alpha'], coverage.inputs[1])
    mix = nodes.new('ShaderNodeMixRGB')
    links.new(coverage.outputs[0], mix.inputs[0])
    links.new(previous, mix.inputs[1])
    links.new(texture.outputs['Color'], mix.inputs[2])
    return mix.outputs[0]


surface = project(folder / 'shell-dense.projection.png', front_name, (0, -1, 0), base_color.outputs[0])
back_art = folder / 'shell-rear.projection.png'
if back_art.is_file():
    surface = project(back_art, rear_name, (0, 1, 0), surface)
for side, layer, direction in (('left', left_name, (-1, 0, 0)), ('right', right_name, (1, 0, 0))):
    path = folder / (side + '.projection.png')
    if path.is_file():
        surface = project(path, layer, direction, surface, side=True)
top_art = folder / 'top.projection.png'
if top_art.is_file():
    surface = project(top_art, top_name, (0, 0, 1), surface, side=True)
emission = nodes.new('ShaderNodeEmission')
links.new(surface, emission.inputs[0])
links.new(emission.outputs[0], output.inputs['Surface'])
baked = nodes.new('ShaderNodeTexImage')
baked.image = bpy.data.images.new('Specimen reference bake', width=1536, height=1536)
nodes.active = baked
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.device = 'CPU'
bpy.context.scene.cycles.samples = 1
bpy.ops.object.bake(type='EMIT', margin=10)
baked.image.filepath_raw = str(folder / 'shell-atlas.jpg')
baked.image.file_format = 'JPEG'
baked.image.save()
baked.image = bpy.data.images.load(baked.image.filepath_raw, check_existing=False)
baked.image.pack()
links.new(baked.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs[0], output.inputs['Surface'])
bsdf.inputs['Roughness'].default_value = .29
bsdf.inputs['Coat Weight'].default_value = .20
bsdf.inputs['Coat Roughness'].default_value = .24
if args.candy_graft_material:
    from material_zones import candy_graft_material
    candy_graft_material(material, baked.image, folder, args.shell_height)

fit_label(shell, folder / 'label.jpg', width=args.label_width, height=args.label_height,
          z=args.label_y, x=args.label_x, radius=.006, bulge=.0014)
shell['Source'] = 'Hunyuan3D-2mv.' if args.native_gltf else 'TripoSR.'
shell['Surface'] = 'Orthographic reference projections baked to the reconstructed shell.'
frame_asset(.90)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / (args.slug + '.blend')))
# Projector UVs stay editable in the .blend. The runtime only needs the
# baked atlas, and it belongs on UV0 for WebGL compatibility.
for name in projector_uvs:
    shell.data.uv_layers.remove(shell.data.uv_layers[name])
bpy.ops.export_scene.gltf(filepath=str(folder / (args.slug + '.glb')), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_cameras=False, export_lights=False)
shell.data.calc_loop_triangles()
print(f'{source_faces:,} generated triangles; {len(shell.data.loop_triangles):,} shell triangles exported.')
