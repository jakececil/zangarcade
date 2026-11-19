"""Fit a reconstructed empty moth shell around the existing Undergrowth PCB."""
import math
import sys
from pathlib import Path
from statistics import median

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction, smoothstep

base, folder = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:]]
bpy.ops.wm.open_mainfile(filepath=str(base))
old_shell = bpy.data.objects['Symmetric single-mold amber shell']
shell = import_reconstruction(folder / 'empty-shell.glb')
shell.name = 'Undergrowth · variable-depth amber casting'
source_faces = len(shell.data.polygons)


def apply(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


coords = [v.co.copy() for v in shell.data.vertices]
face_direction = [v.normal.y for v in shell.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
span = hi - lo
center = (lo + hi) / 2
rows = 15
depth_centers = [median(v.y for v in coords if abs((v.z-lo.z)/span.z-i/rows) < .09)
                 for i in range(rows+1)]
old_tree = BVHTree.FromObject(old_shell, bpy.context.evaluated_depsgraph_get(), deform=False)

for vertex in shell.data.vertices:
    x, y, z = vertex.co
    h = (z-lo.z)/span.z
    row = min(rows-1, int(h*rows))
    delta = h*rows-row
    middle = depth_centers[row]*(1-delta) + depth_centers[row+1]*delta
    x = (x-center.x)*.531/span.x
    z = -.118 + h*.290
    y = (y-middle*.62-center.y*.38)*.095/span.y
    if z > -.092:
        # Use the preceding shell only to establish the minimum cavity for the existing PCB.
        front = old_tree.ray_cast(Vector((x, -.6, z)), Vector((0, 1, 0)), 2)[0]
        back = old_tree.ray_cast(Vector((x, .6, z)), Vector((0, -1, 0)), 2)[0]
        if front and back and front.y < -.008 and back.y > .008:
            # The empty reference has a deep front recess. Its front surface can
            # sit behind the centerline, so identify it by its normal.
            if face_direction[vertex.index] < -.14:
                y = min(y, front.y-.0038)
            elif face_direction[vertex.index] > .22 and y > 0:
                y = max(y, back.y+.0038)
    neck = 1 - smoothstep(-.092, -.061, z)
    if neck:
        angle = math.atan2(y/.020, x/.169)
        a, b = math.cos(angle), math.sin(angle)
        x += (.169*math.copysign(abs(a)**(1/3), a)-x)*neck
        y += (.020*math.copysign(abs(b)**(1/3), b)-y)*neck
    vertex.co = (x, y, z)
shell.data.update()

bm = bmesh.new()
bm.from_mesh(shell.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                     dist=1e-6, plane_co=(0, 0, -.094), plane_no=(0, 0, 1), clear_inner=True)
bm.to_mesh(shell.data)
bm.free()
mirror = shell.modifiers.new('Match left and right wings', 'MIRROR')
mirror.use_bisect_axis[0] = True
mirror.merge_threshold = .00008
apply(shell, mirror)
polish = shell.modifiers.new('Polish reconstruction surface', 'SMOOTH')
polish.factor = .65
polish.iterations = 4
apply(shell, polish)
decimate = shell.modifiers.new('Browser mesh', 'DECIMATE')
decimate.ratio = min(.96, 24500 / len(shell.data.polygons))
decimate.use_symmetry = True
decimate.symmetry_axis = 'X'
apply(shell, decimate)
for face in shell.data.polygons:
    face.use_smooth = True
bpy.data.objects.remove(old_shell, do_unlink=True)

# Sample the outer relief and the distance to its projected edge. The map drives
# both the physical inner wall and ray attenuation, with the same scale and UVs.
tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
w, h = 224, 128
x0, x1, z0, z1 = -.270, .270, -.101, .177
depth = np.zeros((h, w), dtype=np.float32)
for iz, z in enumerate(np.linspace(z0, z1, h)):
    for ix, x in enumerate(np.linspace(x0, x1, w)):
        front = tree.ray_cast(Vector((x, -.5, z)), Vector((0, 1, 0)), 2)[0]
        rear = tree.ray_cast(Vector((x, .5, z)), Vector((0, -1, 0)), 2)[0]
        if front and rear:
            depth[iz, ix] = rear.y-front.y

inside = depth > .0005
band = inside.copy()
inset = np.zeros_like(depth)
mean = depth.copy()
for _ in range(11):
    band = band & np.roll(band, -1, 0) & np.roll(band, 1, 0) & np.roll(band, -1, 1) & np.roll(band, 1, 1)
    inset += band
    mean = (4*mean + np.roll(mean, -1, 0) + np.roll(mean, 1, 0) +
            np.roll(mean, -1, 1) + np.roll(mean, 1, 1))/8
rim = np.exp(-inset/.98)
relief = np.clip((depth-mean-.00065)/.0049, 0, 1)
thickness_map = np.clip(.13 + .78*rim + .67*relief, .13, 1)
for _ in range(2):
    thickness_map = (.6*thickness_map + .1*(np.roll(thickness_map, 1, 0) +
                     np.roll(thickness_map, -1, 0) + np.roll(thickness_map, 1, 1) +
                     np.roll(thickness_map, -1, 1)))
max_thickness = .017


def coordinates(x, z):
    return ((x-x0)/(x1-x0), (z-z0)/(z1-z0))


layer = shell.data.uv_layers.new(name='Casting thickness projection')
layer.active_render = True
for loop in shell.data.loops:
    x, _, z = shell.data.vertices[loop.vertex_index].co
    layer.data[loop.index].uv = coordinates(x, z)
weight = shell.vertex_groups.new(name='Casting thickness')
for vertex in shell.data.vertices:
    x, _, z = vertex.co
    u, v = coordinates(x, z)
    ix, iz = min(w-1, max(0, round(u*(w-1)))), min(h-1, max(0, round(v*(h-1))))
    # An inward wall must leave clearance in the thin antennae and at the
    # connector lip even where oblique rays travel through a wide amber edge.
    feature_limit = max(.095, depth[iz, ix]*.24/max_thickness)
    seat_limit = .105 + .895*smoothstep(-.094, -.073, z)
    weight.add([vertex.index], float(min(thickness_map[iz, ix], feature_limit, seat_limit)), 'REPLACE')

wall = shell.modifiers.new('Uneven cast wall toward PCB cavity', 'SOLIDIFY')
wall.thickness = max_thickness
wall.vertex_group = weight.name
wall.thickness_vertex_group = 0
wall.offset = -1
wall.use_thickness_angle_clamp = True
wall.thickness_clamp = .45

image = bpy.data.images.new('Optical path length · linear', width=w, height=h, alpha=False)
image.colorspace_settings.name = 'Non-Color'
rgba = np.ones((h, w, 4), dtype=np.float32)
rgba[:, :, :3] = thickness_map[:, :, None]
image.pixels.foreach_set(rgba.ravel())
image.file_format = 'PNG'
image.filepath_raw = str(folder / 'amber-thickness.png')
image.save()
image.pack()


def mask_image(name, filename, values):
    result = bpy.data.images.new(name, width=w, height=h, alpha=False)
    result.colorspace_settings.name = 'Non-Color'
    rgba[:, :, :3] = values[:, :, None]
    result.pixels.foreach_set(rgba.ravel())
    result.file_format = 'PNG'
    result.filepath_raw = str(folder / filename)
    result.save()
    result.pack()
    return result


def amber_material(name, nominal):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.995, .66, .29, 1)
    bsdf.inputs['Transmission Weight'].default_value = .97
    bsdf.inputs['IOR'].default_value = 1.46
    bsdf.inputs['Roughness'].default_value = .147
    bsdf.inputs['Coat Weight'].default_value = .19
    bsdf.inputs['Coat Roughness'].default_value = .23
    volume = nodes.new('ShaderNodeVolumeAbsorption')
    volume.inputs['Color'].default_value = (1, .30, .035, 1)
    volume.inputs['Density'].default_value = 1/.014
    links.new(volume.outputs['Volume'], nodes.get('Material Output').inputs['Volume'])
    settings = bpy.data.node_groups.get('glTF Material Output')
    if not settings:
        settings = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        settings.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    output = nodes.new('ShaderNodeGroup')
    output.node_tree = settings
    output.inputs['Thickness'].default_value = nominal
    return material, output.inputs['Thickness']


amber, socket = amber_material('Amber · measured thin windows and heavy edges', max_thickness)
nodes, links = amber.node_tree.nodes, amber.node_tree.links
thickness = nodes.new('ShaderNodeTexImage')
thickness.image = image
thickness.extension = 'EXTEND'
scale = nodes.new('ShaderNodeMath')
scale.operation = 'MULTIPLY'
scale.inputs[1].default_value = max_thickness
links.new(thickness.outputs['Color'], scale.inputs[0])
links.new(scale.outputs[0], socket)
scatter = nodes.new('ShaderNodeTexImage')
scatter.image = mask_image('Transmission through thin and thick resin', 'amber-transmission.png',
                           .985 - .47*thickness_map**1.45)
scatter.extension = 'EXTEND'
links.new(scatter.outputs['Color'], nodes.get('Principled BSDF').inputs['Transmission Weight'])
projection = folder / 'empty-shell.projection.png'
if projection.is_file():
    master = bpy.data.images.load(str(projection))
    projection_width, projection_height = master.size
    pixels = np.empty(projection_width*projection_height*4, dtype=np.float32)
    master.pixels.foreach_get(pixels)
    rgba_ref = pixels.reshape((projection_height, projection_width, 4))
    source_x = np.rint(np.clip((np.linspace(x0, x1, w)+.2655)/.531, 0, 1)*(projection_width-1)).astype(int)
    source_y = np.rint(np.clip((np.linspace(z0, z1, h)+.118)/.290, 0, 1)*(projection_height-1)).astype(int)
    sample = rgba_ref[source_y[:, None], source_x]
    light = sample[:, :, :3] @ np.array((.30, .59, .11), dtype=np.float32)
    soft = light.copy()
    for _ in range(4):
        soft = (4*soft + np.roll(soft, -1, 0) + np.roll(soft, 1, 0) +
                np.roll(soft, -1, 1) + np.roll(soft, 1, 1))/8
    wear_field = np.clip((np.abs(light-soft)-.018)*3.2, 0, .19) * sample[:, :, 3]
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = mask_image('Scuffs from the empty-shell reference', 'amber-roughness.png',
                               .102 + .035*thickness_map + wear_field)
    texture.extension = 'EXTEND'
    links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Roughness'])
    bpy.data.images.remove(master)
if (folder / 'resin-normal.png').is_file():
    scratches = nodes.new('ShaderNodeTexImage')
    scratches.image = bpy.data.images.load(str(folder / 'resin-normal.png'))
    scratches.image.colorspace_settings.name = 'Non-Color'
    scratches.image.pack()
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .21
    links.new(scratches.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
shell.data.materials.clear()
shell.data.materials.append(amber)
shell['Source'] = 'Empty-shell TripoSR geometry; fit around original board'
shell['Thickness range'] = '0.0022 to 0.017 scene units before clamp'

# Tight amber U-molding grips the PCB from three sides. Leave the gold faces exposed.
bumper, _ = amber_material('Amber · exposed contact edge guard', .012)
bumper_shader = bumper.node_tree.nodes.get('Principled BSDF')
bumper_shader.inputs['Transmission Weight'].default_value = .72
bumper_shader.inputs['Base Color'].default_value = (1, .43, .08, 1)
outline = [(-.158,-.144), (.158,-.144), (.158,-.088), (.144,-.088), (.144,-.138),
           (-.144,-.138), (-.144,-.088), (-.158,-.088)]
n = len(outline)
verts = [(x, y, z) for y in [-.0091, .0106] for x, z in outline]
faces = [tuple(range(n)), tuple(reversed(range(n, 2*n)))]
faces += [(i, i+n, (i+1)%n+n, (i+1)%n) for i in range(n)]
mesh = bpy.data.meshes.new('Contacts guard')
mesh.from_pydata(verts, [], faces)
mesh.update()
edge = bpy.data.objects.new('Amber edge guard with open gold contact faces', mesh)
bpy.context.collection.objects.link(edge)
mesh.materials.append(bumper)
rounding = edge.modifiers.new('Rounded cast edge', 'BEVEL')
rounding.width = .0027
rounding.segments = 4

label = folder / 'undergrowth-wordmark.jpg'
if label.exists():
    # Fit to the casting before its inner depth is applied.
    wall.show_viewport = False
    bpy.context.view_layer.update()
    fit_label(shell, label, width=.175, height=.021, z=.019, radius=.002, bulge=.0005)
    wall.show_viewport = True

frame_asset(.96)
bpy.ops.object.select_all(action='DESELECT')
shell.select_set(True)
bpy.context.view_layer.objects.active = shell
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'undergrowth-advance.blend'))

for name in ('Gold contact fingers', 'Copper routing', 'Black ceramic packages'):
    surface = bpy.data.materials[name]
    batch = [o for o in bpy.context.scene.objects if o.type in ('MESH','CURVE') and
             o.data.materials and o.data.materials[0] == surface]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = batch[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.context.object.name = name
bpy.ops.export_scene.gltf(filepath=str(folder / 'undergrowth-advance.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True, export_vertex_color='NONE',
                         export_cameras=False, export_lights=False)
print(f'{source_faces:,} generated triangles. {len(shell.data.polygons):,} faces before solidify.')
