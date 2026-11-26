"""Fit the multiview shell to the arcade's screen and cartridge dimensions."""

import math
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
from relief_lighting import reference_coordinates


WIDTH, HEIGHT, DEPTH = 2.44, 1.45, .342
CENTER_Y = .11
SCREEN_Y = .08
SLOT_DEPTH = .008
PAD = (-.946, .107)
ACTION_A = (1.021, .249)
ACTION_B = (.881, .068)
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


def boolean(shell, cutter, name, operation):
    cutter.select_set(False)
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    opening = shell.modifiers.new(name, 'BOOLEAN')
    opening.operation = operation
    opening.solver = 'EXACT'
    opening.object = cutter
    bpy.ops.object.modifier_apply(modifier=opening.name)


def cut(shell, name, size, position):
    cutter = block(name, size, position)
    boolean(shell, cutter, name, 'DIFFERENCE')
    bpy.data.objects.remove(cutter, do_unlink=True)


def prism(name, outline, front, back, position, material=None, radius=0):
    n = len(outline)
    data = bpy.data.meshes.new(name)
    vertices = [(x, y, z) for y in (front, back) for x, z in outline]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2*n)))]
    faces.extend((i, i+n, ((i+1) % n)+n, (i+1) % n) for i in range(n))
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if material:
        data.materials.append(material)
    if radius:
        bevel = obj.modifiers.new('Rounded edges', 'BEVEL')
        bevel.width = radius
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def round_cap(name, x, z, depth, rings, materials):
    segments = 48
    angles = [math.tau * i / segments for i in range(segments)]
    vertices = [(r * math.cos(a), y, r * math.sin(a)) for r, y, _ in rings for a in angles]
    faces = [tuple(reversed(range(segments)))]
    for row in range(len(rings) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((row * segments + i, row * segments + j,
                          (row + 1) * segments + j, (row + 1) * segments + i))
    faces.append(tuple(range(len(vertices) - segments, len(vertices))))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    for material in materials:
        data.materials.append(material)
    for face in data.polygons:
        if 0 < face.index < len(faces) - 1:
            face.material_index = rings[(face.index - 1) // segments][2]
            face.use_smooth = True
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, depth, z)
    return obj


def detach_shoulder(shell, side, name):
    outline = [(-1.29,.590),(-1.19,.594),(-1.02,.715),(-.825,.748),
               (-.754,.747),(-.737,.920),(-1.34,.920)]
    cutter = prism('Shoulder seam cutter', [(x * side, z) for x, z in outline], -.22, .22, (0,0,0))
    cap = shell.copy()
    cap.data = shell.data.copy()
    bpy.context.collection.objects.link(cap)
    cap.name = name
    boolean(cap, cutter, 'Recover original shoulder cap', 'INTERSECT')
    boolean(shell, cutter, 'Separate shoulder cap from housing', 'DIFFERENCE')
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    cap.select_set(True)
    bpy.context.view_layer.objects.active = cap
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    cap.scale = (.991, .991, .985)


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
    x, y, z = vert.co
    if y < -.130:
        for (cx, cz), radius in ((PAD, .209),(ACTION_A,.127),(ACTION_B,.132)):
            distance = math.hypot(x - cx, z - cz)
            if distance < radius:
                amount = 1 - max(0, (distance-radius*.82)/(radius*.18))
                vert.co.y = max(vert.co.y, y + (-.1305-y) * amount)

reduction = shell.modifiers.new('Web geometry budget', 'DECIMATE')
reduction.ratio = min(.9, 34000 / len(shell.data.polygons))
bpy.ops.object.modifier_apply(modifier=reduction.name)
for face in shell.data.polygons:
    face.use_smooth = True

finish = bpy.data.materials.new('Scuffed ABS, adhesive and anodized hardware')
atlas = bake_reference_atlas(shell, finish, folder, size=1536, basename='field-player-albedo',
                             color=(.042, .048, .052, 1), face_priority=True)
linear = np.clip(pixels(atlas)[..., :3], 0, 1)
u, v, facing = reference_coordinates(finish, *atlas.size)
x, z = (u - .5) * WIDTH, (v - .5) * HEIGHT + CENTER_Y
mask = np.zeros_like(u)
for (cx, cz), radius in ((PAD,.215),(ACTION_A,.136),(ACTION_B,.142)):
    mask = np.maximum(mask, 1 - smooth(radius*.84, radius, np.hypot(x-cx,z-cz)))
mask *= smooth(.12, .68, facing)
plate = bpy.data.images.load(str(folder / 'shell-dense.projection.png'), check_existing=True)
plate_rgb = pixels(plate)[..., :3]
ph, pw, _ = plate_rgb.shape
# Sample unmarked material above the display. A narrow tonal range keeps
# the surface under each button continuous with the surrounding casting.
tile_u = .245 + .087 * (1 - np.abs(np.mod(u * 3.17, 2) - 1))
tile_v = .844 + .041 * (1 - np.abs(np.mod(v * 5.9, 2) - 1))
donor = plate_rgb[(tile_v*(ph-1)).astype(int), (tile_u*(pw-1)).astype(int)] * .91
linear = linear * (1 - mask[..., None]) + donor * mask[..., None]
rgb = linear ** (1 / 2.2)
r, g, b = np.moveaxis(rgb, -1, 0)
bright = .24 * r + .65 * g + .11 * b
adhesive = smooth(.08, .26, g - b) * smooth(.15, .48, r)
scuff = smooth(.20, .48, bright) * (1 - adhesive)
roughness = np.clip(.52 + .25 * adhesive + .16 * scuff, .38, .87)
metallic = (.08 + .33 * scuff) * (1 - adhesive)
nodes, links = finish.node_tree.nodes, finish.node_tree.links
shader = nodes.get('Principled BSDF')
clean = map_texture(nodes,folder,'field-player-clean.jpg','Scuffed housing without control paint bleed',linear,color=True)
links.new(clean.outputs['Color'], shader.inputs['Base Color'])
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
rubber = surface('Gray elastomer control caps', (.044, .047, .052), .34, .04)
gasket = surface('Dark rubber control seals', (.011, .013, .017), .78)
trim = surface('Gold anodized action rims', (.62, .370, .044), .36, .61)
legend = surface('Weathered cream legend ink', (.58, .54, .44), .75)
cap_shader = rubber.node_tree.nodes.get('Principled BSDF')
cap_shader.inputs['Coat Weight'].default_value = .24
cap_shader.inputs['Coat Roughness'].default_value = .29

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

for name, (x, z) in (('FieldA',ACTION_A), ('FieldB',ACTION_B)):
    round_cap('Fixed action socket', x, z, -.128,
              [(.103,.006,0),(.103,-.004,0),(.093,-.014,0)], [gasket])
    round_cap(name, x, z, -.163,
              [(.076,.025,0),(.086,.012,1),(.086,-.011,1),(.080,-.022,1),
               (.072,-.023,0),(.065,-.028,0)], [rubber, trim])

half, arm = .153, .053
cross = [(-arm,half),(-arm,arm),(-half,arm),(-half,-arm),(-arm,-arm),(-arm,-half),
         (arm,-half),(arm,-arm),(half,-arm),(half,arm),(arm,arm),(arm,half)]
prism('Fixed direction well', [(x*1.093,z*1.093) for x,z in cross], -.014, .010,
      (PAD[0],-.130,PAD[1]), gasket, .008)
prism('FieldDPad', cross, -.027, .015, (PAD[0],-.160,PAD[1]), rubber, .013)
detach_shoulder(shell, 1, 'FieldL')
detach_shoulder(shell, -1, 'FieldR')

for name, label, x in (('FieldSelect','SELECT',-.171),('FieldStart','START',.171)):
    block('Fixed system button well', (.127,.019,.051), (x,-.131,-.495), gasket,.012)
    block(name,(.107,.035,.036), (x,-.150,-.495), rubber,.012)
    bpy.ops.object.text_add(location=(x,-.133,-.540), rotation=(math.pi/2,0,0))
    text = bpy.context.object
    text.data.body = label
    text.data.align_x = 'CENTER'
    text.data.size = .022
    text.data.materials.append(legend)
    bpy.ops.object.convert(target='MESH')

shell['Source'] = 'Hunyuan3D-2mv geometry; six ImageGen orthographic color projections'
shell['Screen aperture'] = '1.440 x 0.960 at X 0, Y-up 0.080'
shell['Connector'] = 'Centered ZANG edge-card slot, +Z front'
frame_asset(3.6)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'zang-field-player.blend'))
remove_projectors(shell.data)
for name in ('FieldL','FieldR'):
    remove_projectors(bpy.data.objects[name].data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'zang-field-player.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_lights=False, export_cameras=False)
