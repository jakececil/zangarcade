"""Fit Parasol's reconstructed sunburst around an actual optical assembly."""

import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction
from material_zones import map_texture, pixels, smooth
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors


folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def material(name, rgb, roughness, metallic=0, emission=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    if emission:
        shader.inputs['Emission Color'].default_value = (*rgb, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return result


def block(name, location, dimensions, finish, edge=.00075):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    for vertex in obj.data.vertices:
        for axis, dimension in enumerate(dimensions):
            vertex.co[axis] *= dimension
    obj.data.materials.append(finish)
    bevel = obj.modifiers.new('Radius', 'BEVEL')
    bevel.width = edge
    bevel.segments = 2
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


shell = import_reconstruction(folder / 'shell-dense.glb', native_gltf=True)
shell.name = 'Parasol · reconstructed sunburst and rear solar array'
points = [v.co.copy() for v in shell.data.vertices]
lo = Vector(tuple(min(v[i] for v in points) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in points) for i in range(3)))
span = hi - lo
origin = (lo + hi) * .5
create_projectors(shell.data, points, lo, span)
for vertex, (x, y, z) in zip(shell.data.vertices, points):
    vertex.co = ((x-origin.x)*.455/span.x, (y-origin.y)*.088/span.y,
                 -.143+(z-lo.z)*.442/span.z)

activate(shell)
reduce = shell.modifiers.new('Reduce reconstructed triangles', 'DECIMATE')
reduce.ratio = min(.72, 92000 / len(shell.data.polygons))
bpy.ops.object.modifier_apply(modifier=reduce.name)
for face in shell.data.polygons:
    face.use_smooth = True

cast = bpy.data.materials.new('Weathered bronze, shade ceramic and photovoltaic glass')
atlas = bake_reference_atlas(shell, cast, folder, size=1536, basename='parasol-housing',
                             color=(.13, .066, .030, 1))
nodes, links = cast.node_tree.nodes, cast.node_tree.links
shader = nodes.get('Principled BSDF')
rr, gg, bb = np.moveaxis(np.clip(pixels(atlas)[:, :, :3], 0, 1)**(1/2.2), -1, 0)
bronze = smooth(.028, .31, rr-bb)*smooth(.10, .69, rr)
solar = smooth(.008, .11, bb-rr)
packed = map_texture(nodes, folder, 'parasol-housing-finish.png', 'Housing finish',
                     np.stack((np.ones_like(rr), .65-.30*bronze-.45*solar,
                               .13+.73*bronze+.38*solar), axis=-1))
channels = nodes.new('ShaderNodeSeparateColor')
links.new(packed.outputs['Color'], channels.inputs[0])
links.new(channels.outputs['Green'], shader.inputs['Roughness'])
links.new(channels.outputs['Blue'], shader.inputs['Metallic'])

shell.data.update()
bvh = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
center_x, center_z = 0, .087
segments = 144
inner_radius = .103
# Read from the six-view print: the bottom sector gives way to the nameplate.
sector_radius = [.212,.174,.151,.177,.156,.177,.207,.171,.154,.177,.157,.178,
                 .212,.178,.160,.174,.165,.154,.153,.154,.166,.174,.158,.174]


def ray_depth(theta, radius, rear=False):
    x = center_x + math.cos(theta)*radius
    z = center_z + math.sin(theta)*radius
    return bvh.ray_cast(Vector((x, .24 if rear else -.24, z)),
                        Vector((0, -1 if rear else 1, 0)), .6)[0]


radii = []
for index in range(segments):
    theta = math.tau * index/segments
    key = len(sector_radius)*index/segments
    lower = int(key)
    mix = key - lower
    mix = mix*mix*(3-2*mix)
    radius = (1-mix)*sector_radius[lower] + mix*sector_radius[(lower+1)%len(sector_radius)]
    # Retain the recovered casting as the rim around the optical insert.
    while radius > inner_radius + .014 and ray_depth(theta, radius+.006) is None:
        radius -= .002
    radii.append(radius)


def annulus(name, profile, finish=None, smooth_surface=False):
    vertices, faces = [], []
    for fraction, depth in profile:
        for index, radius in enumerate(radii):
            theta = math.tau*index/segments
            r = inner_radius + fraction*(radius-inner_radius)
            x = center_x + math.cos(theta)*r
            z = center_z + math.sin(theta)*r
            y = depth(theta, r) if callable(depth) else depth
            vertices.append((x, y, z))
    for section in range(len(profile)):
        low = section*segments
        high = ((section+1)%len(profile))*segments
        for index in range(segments):
            after = (index+1)%segments
            faces.append((low+index, low+after, high+after, high+index))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    edit = bmesh.new()
    edit.from_mesh(data)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(data)
    edit.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if finish:
        data.materials.append(finish)
    for face in data.polygons:
        face.use_smooth = smooth_surface
    return obj


def cavity_depth(theta, radius):
    rear = ray_depth(theta, radius, rear=True)
    return min(.018, rear.y-.007) if rear is not None else .003


def recess(target, tool):
    activate(target)
    operation = target.modifiers.new('Optical well', 'BOOLEAN')
    operation.object = tool
    operation.operation = 'DIFFERENCE'
    bpy.ops.object.modifier_apply(modifier=operation.name)
    bpy.data.objects.remove(tool, do_unlink=True)


liner = material('Dark bronze light chamber', (.10, .041, .011), .47, .68)
shell.data.materials.append(liner)
cutter = annulus('Optical cavity cutter', [(-.018,-.11),(1.025,-.11),
                                         (1.025,cavity_depth),(-.018,cavity_depth)])
cutter.data.materials.append(cast)
cutter.data.materials.append(liner)
for face in cutter.data.polygons:
    face.material_index = 1
recess(shell, cutter)

edit = bmesh.new()
edit.from_mesh(shell.data)
bmesh.ops.bisect_plane(edit, geom=list(edit.verts)+list(edit.edges)+list(edit.faces),
                      dist=.00008, plane_co=(0,0,-.115), plane_no=(0,0,1), clear_inner=True)
boundary = [edge for edge in edit.edges if edge.is_boundary
            and all(abs(vertex.co.z+.115)<.0002 for vertex in edge.verts)]
if boundary:
    bmesh.ops.holes_fill(edit, edges=boundary, sides=0)
edit.to_mesh(shell.data)
edit.free()
shell['opticalDisplay'] = True
shell['cartridgeShadow'] = 'both'

glass = material('Deep amber optical resin', (.91, .54, .14), .17)
nodes, links = glass.node_tree.nodes, glass.node_tree.links
shader = nodes.get('Principled BSDF')
shader.inputs['Transmission Weight'].default_value = .96
shader.inputs['IOR'].default_value = 1.48
shader.inputs['Coat Weight'].default_value = .27
shader.inputs['Coat Roughness'].default_value = .13
group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
group.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
volume = nodes.new('ShaderNodeGroup')
volume.node_tree = group
volume.inputs[0].default_value = .012
absorption = nodes.new('ShaderNodeVolumeAbsorption')
absorption.inputs['Color'].default_value = (1,.66,.24,1)
absorption.inputs['Density'].default_value = 26
links.new(absorption.outputs[0], nodes.get('Material Output').inputs['Volume'])

# The inside is smooth. Small radial peaks in the thicker face spread
# the two LED clusters into short rays as the body turns.
def flute(depth, amplitude):
    return lambda theta, _: depth-amplitude*(.5+.5*math.cos(36*theta))**3


annulus('Amber lens · fluted solid molding', [(0,-.043),(.11,flute(-.052,.0006)),
         (.40,flute(-.061,.0015)),(.73,flute(-.060,.0017)),(.94,flute(-.052,.0009)),
         (1,-.041),(1,-.030),(.68,-.035),(.24,-.036),(0,-.033)], glass, True)

pcb = material('Dull dark photovoltaic board', (.045,.056,.024), .56)
contacts = material('Gold plated contacts', (.77,.44,.114), .23, .96)
insulator = material('Heat-resistant phenolic', (.014,.017,.022), .54)
amber_smd = material('Amber die', (1,.37,.045), .24, emission=10)
amber_chip = material('Warm optical package', (1,.73,.32), .29, emission=2.8)
cyan = material('Cool shade phosphor', (.03,.65,.57), .30, emission=3.5)
for index in [87, 129]:
    theta = math.tau*index/segments
    radius = inner_radius + .50*(radii[index]-inner_radius)
    x, z = math.cos(theta)*radius, center_z+math.sin(theta)*radius
    block('Lamp carrier', (x,-.009,z), (.039,.007,.034), pcb)
    for dx in [-.007, .007]:
        for dz in [-.006, .006]:
            block('Ceramic LED package', (x+dx,-.017,z+dz), (.010,.007,.009), amber_chip)
            block('Recessed amber die', (x+dx,-.021,z+dz), (.0048,.0015,.0048), amber_smd, .0004)
    light = bpy.data.lights.new('Amber lamp bounce', 'POINT')
    light.color = (1,.41,.085)
    light.energy = .00045
    light.shadow_soft_size = .007
    light.use_custom_distance = True
    light.cutoff_distance = .12
    lamp = bpy.data.objects.new(light.name, light)
    bpy.context.collection.objects.link(lamp)
    lamp.location = (x,-.021,z)

for index in range(90, 127, 3):
    theta = math.tau*index/segments
    r = inner_radius + .006
    x, z = math.cos(theta)*r, center_z+math.sin(theta)*r
    marker = block('Shade phosphor inlay', (x,-.029,z), (.010,.003,.0023), cyan, .00045)
    marker.rotation_euler.y = -(theta+math.pi/2)

block('Keyed socket shoulder', (0,.001,-.113), (.224,.058,.015), liner, .0035)
block('Insulated plug backing', (0,.007,-.128), (.210,.038,.030), insulator, .0028)
block('Contact substrate', (0,-.015,-.128), (.190,.009,.029), pcb)
for x, width in [(-.100,.011),(.099,.014)]:
    block('Guide rail', (x,-.015,-.129), (width,.017,.029), insulator, .0014)
pads = [block('Plated contact', ((index-15.5)*.0057,-.020,-.1294),
              (.0037,.00165,.0228 if index%8 else .025), contacts, .00045)
        for index in range(32)]
activate(pads[0])
for pad in pads:
    pad.select_set(True)
bpy.ops.object.join()
bpy.context.object.name = '32 gold-plated contact fingers'

frame_asset(.75)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'parasol.blend'))
remove_projectors(shell.data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'parasol.glb'), export_format='GLB',
                         export_apply=True, export_yup=True, export_extras=True,
                         export_vertex_color='NONE', export_lights=True, export_cameras=False)
