"""Fit Parasol's reconstructed sunburst around an frosted light guide and polished structural rim."""

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
    vertex.co = ((x-origin.x)*.455/span.x, (y-origin.y)*.078/span.y,
                 -.143+(z-lo.z)*.442/span.z)

activate(shell)
reduce = shell.modifiers.new('Reduce reconstructed triangles', 'DECIMATE')
reduce.ratio = min(.72, 92000 / len(shell.data.polygons))
bpy.ops.object.modifier_apply(modifier=reduce.name)
for face in shell.data.polygons:
    face.use_smooth = True

cast = bpy.data.materials.new('Champagne alloy, phosphate trim and photovoltaic glass')
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
split_z = .020
seat_z = .010
center_z = .106
segments = 216


def trace_front(x, z):
    return bvh.ray_cast(Vector((x, -.24, z)), Vector((0, 1, 0)), .58)[0]


plate_samples = [trace_front(x, split_z - .014) for x in [-.09, -.05, 0, .05, .09]]
plate_depths = [hit.y for hit in plate_samples if hit is not None]
if len(plate_depths) < 3:
    raise ValueError('Could not locate the front nameplate plane')
face_plane = float(np.median(plate_depths))


# Record each ray of the reconstruction before cutting the front tray away.
# The diffuser inherits both the original outline and the sculpted face relief.
silhouette = []
for index in range(segments):
    theta = math.tau * index / segments
    dx, dz = math.cos(theta), math.sin(theta)
    candidates = [.31 * step / 100 for step in range(101)]
    for radius in reversed(candidates):
        if center_z + dz * radius >= seat_z and trace_front(dx * radius, center_z + dz * radius) is not None:
            break
    low, high = radius, radius + .0031
    for _ in range(8):
        probe = (low + high) / 2
        z = center_z + dz * probe
        if z >= seat_z and trace_front(dx * probe, z) is not None:
            low = probe
        else:
            high = probe
    silhouette.append((dx * low, dz * low))

relief = []
rings = 22
for ring in range(rings + 1):
    points = []
    for x, z in silhouette:
        fraction = .932 * ring / rings
        original = trace_front(x*fraction, center_z + z*fraction)
        points.append(max(-.025, min(.022, original.y + .021)) if original is not None else 0)
    relief.append(points)
bvh = None


def optical_mesh(name, profile, finish):
    vertices, faces, rows = [], [], []
    for fraction, depth in profile:
        width = 1 if fraction == 0 else segments
        rows.append(list(range(len(vertices), len(vertices) + width)))
        for index, (dx, dz) in enumerate(silhouette[:width]):
            world_depth = depth(index) if callable(depth) else depth
            vertices.append((dx*fraction, world_depth, center_z + dz*fraction))
    for lower, upper in zip(rows, rows[1:] + rows[:1]):
        if len(lower) == len(upper) == 1:
            continue
        for index in range(segments):
            after = (index + 1) % segments
            if len(lower) == 1:
                faces.append((lower[0], upper[after], upper[index]))
            elif len(upper) == 1:
                faces.append((lower[index], lower[after], upper[0]))
            else:
                faces.append((lower[index], lower[after], upper[after], upper[index]))
    return finished_mesh(name, vertices, faces, finish, optical_uv=True)


def finished_mesh(name, vertices, faces, finish, *, optical_uv=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    edit = bmesh.new()
    edit.from_mesh(data)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(data)
    edit.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(finish)
    for face in data.polygons:
        face.use_smooth = True
    if optical_uv:
        uv = data.uv_layers.new(name='Optical field')
        for loop in data.loops:
            position = data.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = (position.x/.50+.5, (position.z-.01)/.31)
    return obj


liner = material('Opaque champagne light tray', (.49,.31,.18), .41, .59)
shell.data.materials.append(liner)
cut = block('Remove the opaque front of the upper reconstructed shell',
            (0,-.194,split_z+.28), (1,.42,.56), liner, .001)
activate(cut)
bpy.ops.object.modifier_apply(modifier=cut.modifiers[0].name)
# Assign the new chamber wall its own backing finish.
activate(shell)
trim = shell.modifiers.new('Recess for the optical cartridge assembly', 'BOOLEAN')
trim.operation = 'DIFFERENCE'
trim.object = cut
trim.material_mode = 'TRANSFER'
bpy.ops.object.modifier_apply(modifier=trim.name)
bpy.data.objects.remove(cut, do_unlink=True)

edit = bmesh.new()
edit.from_mesh(shell.data)
contact_seam = -.101
bmesh.ops.bisect_plane(edit, geom=list(edit.verts)+list(edit.edges)+list(edit.faces),
                      dist=.00008, plane_co=(0,0,contact_seam), plane_no=(0,0,1), clear_inner=True)
boundary = [edge for edge in edit.edges if edge.is_boundary
            and all(abs(vertex.co.z-contact_seam)<.0002 for vertex in edge.verts)]
if boundary:
    bmesh.ops.holes_fill(edit, edges=boundary, sides=0)
bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
edit.to_mesh(shell.data)
edit.free()
shell['opticalDisplay'] = True
shell['cartridgeShadow'] = 'both'


def optical_finish(name, rgb, roughness, transmission, thickness, attenuation):
    finish = material(name, rgb, roughness)
    nodes, links = finish.node_tree.nodes, finish.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Transmission Weight'].default_value = transmission
    shader.inputs['IOR'].default_value = 1.46
    shader.inputs['Coat Weight'].default_value = .18
    shader.inputs['Coat Roughness'].default_value = min(.18, roughness)
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    volume = nodes.new('ShaderNodeGroup')
    volume.node_tree = group
    volume.inputs[0].default_value = thickness
    absorption = nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (*attenuation, 1)
    absorption.inputs['Density'].default_value = 12
    links.new(absorption.outputs[0], nodes.get('Material Output').inputs['Volume'])
    return finish


def emission_map(finish, field, colors, strength, filename):
    nodes, links = finish.node_tree.nodes, finish.node_tree.links
    shader = nodes.get('Principled BSDF')
    image = map_texture(nodes, folder, filename, 'Transported light',
                        field[..., None]*colors, color=True)
    shader.inputs['Emission Strength'].default_value = strength
    links.new(image.outputs['Color'], shader.inputs['Emission Color'])


size = 768
u, v = np.meshgrid(np.linspace(0,1,size, dtype=np.float32),
                   np.linspace(0,1,size, dtype=np.float32))
x, z = (u-.5)*.50, .01+v*.31
lift = z-.010
dist = np.hypot(x, lift)
theta = np.arctan2(lift, x)
rng = np.random.default_rng(102)
star = (.5+.5*np.cos((theta-math.pi/2)*8)) ** 8
soft_arc = np.exp(-((dist-.128)/.023)**2)
hub = np.exp(-((x/.079)**2+((z-.033)/.053)**2))
body_glow = np.exp(-((x/.190)**2+((z-.103)/.153)**2))
spokes = star*np.exp(-((dist-.126)/.100)**2)
field = np.clip(.035+.18*body_glow+.29*soft_arc+.69*hub+.23*spokes, 0, .98)
warmth = np.stack((np.ones_like(hub),.49+.29*hub,.185+.33*hub),axis=-1)
frost = optical_finish('Pearlescent frosted diffusion face', (.77,.60,.42), .40, .68, .014, (1,.79,.58))
emission_map(frost, field, warmth, 3.65, 'diffuser-transport.jpg')
nodes, links = frost.node_tree.nodes, frost.node_tree.links
shader = nodes.get('Principled BSDF')
grain = rng.normal(0,.165,(size,size)).astype(np.float32)
normal_x = np.roll(grain,1,axis=1)-grain
normal_y = np.roll(grain,1,axis=0)-grain
micro = np.stack((.5+normal_x*.52,.5+normal_y*.52,np.ones_like(grain)),axis=-1)
texture = map_texture(nodes, folder, 'frost-grain.png', 'Mold grain', micro)
normal = nodes.new('ShaderNodeNormalMap')
normal.inputs['Strength'].default_value = .34
links.new(texture.outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], shader.inputs['Normal'])

rim = optical_finish('Polished structural edge · clear champagne acrylic',
                     (.99,.96,.87), .051, .985, .010, (1,.91,.77))
emission_map(rim, .15+.16*spokes+.21*soft_arc, np.array([1,.53,.21]),
             .94, 'rim-transport.jpg')


def front_surface(ring):
    # Register the face to the front of the nameplate. Keep the pattern
    # in shallow relief so the glass seats below the polished lip.
    return lambda index: face_plane + .00065 + .026*(relief[ring][index]+.025)


profile = [(.932*ring/rings,front_surface(ring)) for ring in range(rings+1)]
profile += [(.932,-.025),(.74,-.017),(.20,-.017),(0,-.018)]
optical_mesh('Frosted face · remeshed from Hunyuan relief', profile, frost)
optical_mesh('Polished clear rim · traced Hunyuan silhouette',
             [(.928,face_plane+.00055),(.965,face_plane-.00135),
              (1.003,face_plane+.003),(1.008,.010),(.986,.026),(.956,.023),
              (.929,.011),(.922,-.017)], rim)

pcb = material('Heat-resistant burgundy circuit board', (.095,.032,.020), .56,.04)
contacts = material('Gold plated contacts', (.77,.44,.114), .23,.96)
insulator = material('Heat-resistant phenolic', (.014,.017,.022), .54)
diode = material('Phosphor LED strip · warm white', (1,.62,.29), .34, emission=3.8)
reflector = material('Foil strip backing', (.75,.51,.21), .34,.38, emission=.28)
edge_guide = material('Amber light guide behind the clear edge', (1,.53,.19), .38, emission=.67)
optical_mesh('Edge light guide', [(.941,-.011),(.957,-.010),(.963,-.007),
                                  (.962,-.003),(.940,-.003)], edge_guide)


def strip(name, radius, width, start, end, y, finish):
    steps = max(2,math.ceil(44*(end-start)/math.pi))
    angles = [start+(end-start)*index/steps for index in range(steps+1)]
    vertices = [(r*math.cos(a),y,.006+r*math.sin(a)) for r in [radius-width/2,radius+width/2] for a in angles]
    stride = len(angles)
    faces = [(i,i+1,i+stride+1,i+stride) for i in range(steps)]
    obj = finished_mesh(name, vertices, faces, finish)
    body = obj.modifiers.new('Strip thickness', 'SOLIDIFY')
    body.thickness = .0013
    return obj


strip('Curved flexible circuit carrier',.128,.018,.12,math.pi-.12,-.008,pcb)
strip('Foil liner under diode strip',.128,.012,.14,math.pi-.14,-.011,reflector)
emitters = []
for cell in range(18):
    angle = .24+(math.pi-.48)*cell/17
    emitters.append(strip('Segmented LED die',.128,.006,angle-.029,angle+.029,-.014,diode))
activate(emitters[0])
for emitter in emitters:
    emitter.select_set(True)
bpy.ops.object.join()
bpy.context.object.name = '18 phosphor dies on the flexible light strip'

for x, z, energy in [(0,.037,.00043),(-.083,.029,.00020),(.083,.029,.00020)]:
    light = bpy.data.lights.new('Warm local light spill', 'POINT')
    light.color = (1,.57,.27)
    light.energy = energy
    light.shadow_soft_size = .014
    light.use_custom_distance = True
    light.cutoff_distance = .17
    lamp = bpy.data.objects.new(light.name, light)
    bpy.context.collection.objects.link(lamp)
    lamp.location = (x,-.022,z)
block('Keyed socket shoulder', (0,.001,-.108), (.310,.058,.017), liner, .0035)
block('Insulated plug backing', (0,.007,-.128), (.297,.038,.030), insulator, .0028)
block('Contact substrate', (0,-.015,-.128), (.279,.009,.029), pcb)
for x, width in [(-.143,.011),(.142,.014)]:
    block('Guide rail', (x,-.015,-.129), (width,.017,.029), insulator, .0014)
pads = [block('Plated contact', ((index-15.5)*.0084,-.020,-.1294),
              (.0056,.00165,.0228 if index%8 else .025), contacts, .00045)
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
