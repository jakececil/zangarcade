"""Finish the generated moth body as one hollow amber casting around a continuous PCB."""
import math
import sys
from pathlib import Path
from statistics import median

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction, smoothstep

folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
shell = import_reconstruction(folder / 'undergrowth-dense.glb')
shell.name = 'Symmetric single-mold amber shell'
source_faces = len(shell.data.polygons)
vertices = [vertex.co.copy() for vertex in shell.data.vertices]
low = Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
high = Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
size = high - low
center = (high + low) / 2
levels = 17
depth_centers = [
    median(v.y for v in vertices if abs((v.z - low.z) / size.z - i / levels) < .075)
    for i in range(levels + 1)
]
body_bottom = -.094


def cubic(start, a, b, end):
    samples = []
    for i in range(26):
        t = i / 25
        s = 1 - t
        samples.append(tuple(s**3 * start[j] + 3*s*s*t*a[j] + 3*s*t*t*b[j] + t**3*end[j]
                             for j in range(2)))
    return samples


wing_veins = [
    cubic((.019, .142), (.057, .052), (.130, .079), (.247, .064)),
    cubic((.025, .126), (.071, .040), (.178, .020), (.214, -.033)),
    cubic((.024, .103), (.043, .032), (.097, -.022), (.166, -.080)),
]


def molded_relief(x, z):
    x = abs(x)
    rib = 0
    for vein in wing_veins:
        for i, ((a, b), (c, d)) in enumerate(zip(vein, vein[1:])):
            dx, dz = c - a, d - b
            position = min(1, max(0, ((x-a)*dx + (z-b)*dz) / (dx*dx + dz*dz)))
            distance_sq = (x-a-position*dx)**2 + (z-b-position*dz)**2
            if distance_sq < .00014:
                ends = min(1, (25 - i) / 5)
                rib = max(rib, .0048 * ends * math.exp(-distance_sq / .000016))
    eye_radius = math.hypot(x - .212, z - .097)
    eye = .0043 * math.exp(-((eye_radius - .015) / .0035)**2)
    collar = .0065 * math.exp(-((x / .022)**2 + ((z-.133) / .023)**2))
    return max(rib, eye, collar)


for vertex in shell.data.vertices:
    x, y, z = vertex.co
    height = (z - low.z) / size.z
    row = min(levels - 1, int(height * levels))
    fraction = height * levels - row
    local_center = depth_centers[row] * (1 - fraction) + depth_centers[row + 1] * fraction
    y = (y - local_center * .70 - center.y * .30) * .069 / size.y
    x = (x - center.x) * .522 / size.x
    z = -.142 + height * .310
    seat_fade = 1 - smoothstep(-.065, -.043, z)
    x += (max(-.185, min(.185, x)) - x) * seat_fade
    y += (max(-.030, min(.030, y)) - y) * seat_fade
    vertex.co = (x, y, z)
shell.data.update()

bm = bmesh.new()
bm.from_mesh(shell.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                     dist=1e-6, plane_co=(0, 0, body_bottom), plane_no=(0, 0, 1), clear_inner=True)
bm.to_mesh(shell.data)
bm.free()

def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


mirror = shell.modifiers.new('Moth symmetry', 'MIRROR')
mirror.use_bisect_axis[0] = True
mirror.merge_threshold = .00006
apply_modifier(shell, mirror)
relax = shell.modifiers.new('Polish casting', 'SMOOTH')
relax.factor = .71
relax.iterations = 5
apply_modifier(shell, relax)
for vertex in shell.data.vertices:
    x, y, z = vertex.co
    if z < -.085:
        continue
    # Emboss the front and rear together with the casting. The rim falls off naturally near the sidewall.
    face = smoothstep(.003, .019, abs(y))
    vertex.co.y += math.copysign(molded_relief(x, z) * face, y)
for vertex in shell.data.vertices:
    x, y, z = vertex.co
    neck = 1 - smoothstep(body_bottom + .001, body_bottom + .019, z)
    if neck <= 0:
        continue
    angle = math.atan2(y / .020, x / .168)
    a, b = math.cos(angle), math.sin(angle)
    rounded_x = .168 * math.copysign(abs(a)**(1/3), a)
    rounded_y = .018 * math.copysign(abs(b)**(1/3), b)
    vertex.co.x += (rounded_x - x) * neck
    vertex.co.y += (rounded_y - y) * neck
    if abs(z - body_bottom) < .001:
        vertex.co.z = body_bottom
shell.data.update()
decimate = shell.modifiers.new('Simplify generated casting', 'DECIMATE')
decimate.ratio = min(.95, 24000 / len(shell.data.polygons))
decimate.use_symmetry = True
decimate.symmetry_axis = 'X'
apply_modifier(shell, decimate)
for polygon in shell.data.polygons:
    polygon.use_smooth = polygon.center.z > body_bottom + .00012

tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())


def surfaces(x, z):
    front, _, _, _ = tree.ray_cast(Vector((x, -.8, z)), Vector((0, 1, 0)), 2)
    back, _, _, _ = tree.ray_cast(Vector((x, .8, z)), Vector((0, -1, 0)), 2)
    return (front.y, back.y) if front and back else (0, 0)


def material(name, color, roughness=.4, metalness=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    return mat, shader


amber, shader = material('Clear honey amber polymer', (1, .45, .108), .123)
amber.use_backface_culling = True
shader.inputs['Transmission Weight'].default_value = .89
shader.inputs['IOR'].default_value = 1.44
shader.inputs['Coat Weight'].default_value = .28
shader.inputs['Coat Roughness'].default_value = .21
nodes, links = amber.node_tree.nodes, amber.node_tree.links
gl_settings = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
gl_settings.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
thickness = nodes.new('ShaderNodeGroup')
thickness.node_tree = gl_settings
thickness.inputs['Thickness'].default_value = .004
absorption = nodes.new('ShaderNodeVolumeAbsorption')
absorption.inputs['Color'].default_value = (1, .52, .12, 1)
absorption.inputs['Density'].default_value = 11
links.new(absorption.outputs['Volume'], nodes.get('Material Output').inputs['Volume'])
if (folder / 'resin-normal.png').exists():
    uv = shell.data.uv_layers.new(name='Mold finish')
    for loop in shell.data.loops:
        x, y, z = shell.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (x / .55 + .5 + y * .82, z / .29 + .34)
    uv.active_render = True
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(folder / 'resin-normal.png'))
    texture.image.colorspace_settings.name = 'Non-Color'
    texture.image.pack()
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .24
    links.new(texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
shell.data.materials.clear()
shell.data.materials.append(amber)


def obj_mesh(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def cube(name, center, dimensions, surface, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        mod = obj.modifiers.new('Edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return obj


board, _ = material('Deep olive solder mask and board edge', (.026, .071, .043), .54)
gold, _ = material('Gold contact fingers', (.77, .44, .115), .29, .78)
copper, _ = material('Copper routing', (.53, .245, .065), .45, .21)
chips, _ = material('Black ceramic packages', (.019, .019, .016), .59)

# The open foot receives the PCB. Mold the inner wall toward the cavity and bridge
# the lip so the casting stays one connected piece of polymer.
wall = shell.modifiers.new('Hollow one-piece molding', 'SOLIDIFY')
wall.thickness = .0026
wall.offset = -1
wall.use_even_offset = True
shell['Source'] = 'Symmetric, simplified TripoSR casting with side depth guided by the turnaround'
shell['Parts'] = 'One amber body; one continuous printed circuit board with gold fingers'

# Every board vertex above the foot is inset between front and back shell surfaces.
wing = [(.150, -.142), (.150, -.089), (.161, -.067), (.182, -.033),
        (.206, .008), (.224, .053), (.231, .094), (.208, .114),
        (.162, .106), (.111, .081), (.066, .069), (.032, .109), (0, .131)]
outline = wing + [(-x, z) for x, z in reversed(wing[:-1])]
fitted = []
for x, z in outline:
    if z > -.088:
        for _ in range(14):
            front, back = surfaces(x, z)
            if front < -.010 and back > .010:
                break
            x *= .96
            z = .016 + (z - .016) * .93
    fitted.append((x, z))

half = .0057
n = len(fitted)
board_vertices = [(x, y, z) for y in [-half, half] for x, z in fitted]
board_faces = [tuple(range(n)), tuple(reversed(range(n, 2*n)))]
board_faces.extend((i, i+n, (i+1) % n + n, (i+1) % n) for i in range(n))
pcb = obj_mesh('Continuous wing PCB with exposed connector tongue', board_vertices, board_faces, board)
pcb['Connection'] = 'The same PCB polygon extends from the wings into the handheld'
bevel = pcb.modifiers.new('Routed board edges', 'BEVEL')
bevel.width = .0015
bevel.segments = 3


def pcb_contains(x, z):
    inside = False
    for i, (a, b) in enumerate(fitted):
        c, d = fitted[i - 1]
        if (b > z) != (d > z) and x < (c-a) * (z-b) / (d-b) + a:
            inside = not inside
    return inside


def path(name, points, radius, surface):
    fitted_points = []
    for x, y, z in points:
        for _ in range(32):
            if pcb_contains(x, z):
                break
            x *= .93
            z = .010 + (z - .010) * .93
        else:
            raise ValueError('The wing PCB has no room for a trace')
        fitted_points.append((x, y, z))
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 0
    curve.use_fill_caps = True
    line = curve.splines.new('POLY')
    line.points.add(len(fitted_points) - 1)
    for point, xyz in zip(line.points, fitted_points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(surface)
    return obj


for i in range(28):
    x = (i - 13.5) * .0101
    cube('Gold contact finger', (x, -.0062, -.114), (.0074, .0014, .047), gold, .0006)
    sign = 1 if x >= 0 else -1
    fan = x * 1.18 + sign * .0026
    z = -.025 + (i % 7) * .007
    path('Front trace from contact', [(x, -.006, -.096), (x, -.006, -.071),
          (fan, -.006, -.049), (fan, -.006, z), (fan * .88, -.006, z + .014)], .0008, copper)

for side in (-1, 1):
    for i in range(8):
        x = side * (.016 + i * .013)
        fan = x * 1.26
        top = .058 + (i % 4) * .016
        path('Mirrored rear trace', [(x, .006, -.081), (x, .006, -.051),
              (fan, .006, -.023), (fan, .006, top - .026), (fan * .62, .006, top)], .001, copper)

for x, z, size_chip in [(0, -.016, .049), (0, .077, .024), (-.100, .030, .026),
                        (.100, .030, .026), (-.151, .079, .021), (.151, .079, .021)]:
    lo, _ = surfaces(x, z)
    if lo > -.013 or not all(pcb_contains(x + dx, z + dz)
                             for dx in [-size_chip/2, size_chip/2] for dz in [-size_chip/2, size_chip/2]):
        continue
    cube('Moth board chip', (x, -.009, z), (size_chip, .007, size_chip), chips, .0026)
    for side in (-1, 1):
        for i in range(7):
            leg_z = z + (i - 3) * size_chip / 8
            cube('Plated package leg', (x + side * size_chip * .52, -.0064, leg_z),
                 (.0078, .0017, .0022), gold, .00038)

for x in [-.183, -.159, -.067, .067, .159, .183]:
    for z in [.012, .030, .049]:
        if pcb_contains(x, z) and surfaces(x, z)[0] < -.011:
            cube('SMD pad', (x, -.0065, z), (.009, .0019, .0046), gold, .0004)
            cube('SMD', (x, -.0081, z), (.005, .0036, .0044), chips, .00045)

frame_asset(.96)
bpy.ops.object.select_all(action='DESELECT')
shell.select_set(True)
bpy.context.view_layer.objects.active = shell
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'undergrowth-advance.blend'))

# Batch the copper routing and tiny packages for export. The source parts stay editable.
for surface in (gold, copper, chips):
    batch = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o.data.materials[0] == surface]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = batch[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.context.object.name = surface.name
bpy.ops.export_scene.gltf(filepath=str(folder / 'undergrowth-advance.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True, export_vertex_color='NONE',
                         export_cameras=False, export_lights=False)
print(f'{source_faces:,} source faces. Finished casting has {len(shell.data.polygons):,} faces.')
