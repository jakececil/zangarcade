"""Build the Lower Management cartridge from the Specimen Cabinet print atlas."""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset


folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metal, roughness, print_file=None):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    if print_file:
        image = nodes.new('ShaderNodeTexImage')
        image.image = bpy.data.images.load(str(folder / print_file), check_existing=True)
        image.image.pack()
        result.node_tree.links.new(image.outputs['Color'], shader.inputs['Base Color'])
    return result


oxide = material('Pocked plum enamel over cast alloy', (.19, .08, .09), .66, .43, 'oxide.jpg')
steel = material('Oil blackened bearing steel', (.038, .044, .053), .84, .34)
bronze = material('Darkened bronze edge and bushings', (.34, .16, .049), .86, .30)
gold = material('Hard gold electrical contacts', (.72, .44, .105), .97, .25)
phenolic = material('Insulating back and keyed rails', (.046, .025, .029), .05, .61)
pcb = material('Burgundy glass fiber laminate', (.085, .021, .044), .12, .53)
print_ink = material('Specimen Cabinet enamel transfers', (.9, .9, .9), .05, .38, 'specimen-face-atlas.jpg')
title_ink = material('Box-art title under varnish', (.92, .89, .83), .12, .38, 'title.jpg')
spark = material('Amber signal lens', (.9, .24, .022), .2, .22)


def mesh(name, vertices, faces, finish, parent=None, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(finish)
    if uv:
        layer = data.uv_layers.new()
        for polygon in data.polygons:
            for loop, coordinate in zip(polygon.loop_indices, uv[polygon.index]):
                layer.data[loop].uv = coordinate
    return obj


def bevel(obj, radius):
    rounded = obj.modifiers.new('Machined edge', 'BEVEL')
    rounded.width = radius
    rounded.segments = 3
    obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def box(name, location, size, finish, radius=.001, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    for vertex in obj.data.vertices:
        for axis, length in enumerate(size):
            vertex.co[axis] *= length
    obj.data.materials.append(finish)
    return bevel(obj, radius)


def cylinder(name, location, radius, height, finish, parent=None, frontal=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=radius, depth=height)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(finish)
    if frontal:
        obj.rotation_euler.x = math.pi / 2
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return bevel(obj, min(.0012, height / 8))


def hex_xy(radius, side):
    angle = (-2 + side) * math.pi / 3
    return radius * math.cos(angle), radius * math.sin(angle)


def collar(name, profile, finish, parent=None):
    vertices = [(*hex_xy(radius, side), z) for radius, z in profile for side in range(6)]
    faces = [tuple(reversed(range(6)))]
    uv = [tuple((x / .35 + .5, y / .35 + .5) for x, y, _ in vertices[:6])]
    for level in range(len(profile)-1):
        for side in range(6):
            a, b = 6 * level + side, 6 * level + (side+1) % 6
            faces.append((a, b, b+6, a+6))
            uv.append(((.03, .08), (.97, .08), (.97, .92), (.03, .92)))
    faces.append(tuple(range(len(vertices)-6, len(vertices))))
    uv.append(tuple((x / .35 + .5, y / .35 + .5) for x, y, _ in vertices[-6:]))
    return bevel(mesh(name, vertices, faces, finish, parent, uv), .0014)


def plate(name, x, y, z, width, height, finish):
    vertices = [(x-width/2, y, z-height/2), (x+width/2, y, z-height/2),
                (x+width/2, y, z+height/2), (x-width/2, y, z+height/2)]
    return mesh(name, vertices, [(0, 1, 2, 3)], finish, uv=[((0, 0), (1, 0), (1, 1), (0, 1))])


def make_band(index, height, radius):
    name = ['Head', 'Torso', 'Legs'][index]
    pivot = bpy.data.objects.new(f'{name} · six-stop axle', None)
    bpy.context.collection.objects.link(pivot)
    pivot.location.z = height
    pivot['cartridgeDrumBand'] = index
    collar(f'{name} · hex carrier', [(radius-.0035, -.030), (radius, -.027),
                                    (radius, .027), (radius-.0035, .030)], steel, pivot)
    for z in [-.028, .028]:
        collar(f'{name} · bronze seam', [(radius-.0015, z-.0008),
                                        (radius-.0015, z+.0008)], bronze, pivot)
    vertices = [(*hex_xy(radius+.00045, side), z) for z in [-.0265, .0265] for side in range(6)]
    faces, uv = [], []
    for side in range(6):
        right = (side+1) % 6
        faces.append((side, right, right+6, side+6))
        # Small UV bleed lands inside the duplicated border around each tile.
        u, v = side / 6, (2-index) / 3
        left, right = u + .0026, u + 1/6 - .0026
        bottom, top = v + .005, v + 1/3 - .005
        uv.append(((left, bottom), (right, bottom), (right, top), (left, top)))
    mesh(f'{name} · six printed faces', vertices, faces, print_ink, pivot, uv)


radius = .136
cylinder('Common steel axle', (0, 0, .01), .022, .229, steel)
for z in [-.093, -.025, .043, .111]:
    cylinder('Bronze thrust bearing', (0, 0, z), .033, .007, bronze)
for index, z in enumerate([.077, .009, -.059]):
    make_band(index, z, radius)

# The outer housing remains fixed. Only the shallow keyed neck moves into the slot.
collar('Cast upper housing', [(.130, .109), (.144, .116), (.144, .146), (.117, .167)], oxide)
collar('Retainer edge', [(.142, .115), (.145, .117), (.145, .119)], bronze)
title_front = -.144 * math.sqrt(3) / 2
box('Framed title recess', (0, title_front-.001, .133), (.109, .003, .030), bronze, .0025)
plate('Lower Management title', 0, title_front-.0027, .133, .103, .025, title_ink)
for x in [-.062, .062]:
    cylinder('Housing screw', (x, title_front-.001, .135), .0045, .003, bronze, frontal=True)
    box('Screw drive', (x, title_front-.0026, .135), (.0055, .0007, .0013), steel, .0003)
for y in [-.060, -.042, -.024, -.006, .012, .030, .048, .066]:
    box('Axle housing vents', (0, y, .167), (.118, .008, .0016), steel, .0007)
for x in [-.045, 0, .045]:
    box('Rear cooling ribs', (x, -title_front+.0009, .132), (.012, .003, .019), steel)

collar('Cast lower shoulder', [(.098, -.117), (.142, -.105), (.142, -.094), (.129, -.090)], oxide)
collar('Foot rim', [(.140, -.105), (.143, -.103), (.143, -.101)], bronze)
box('Keyed neck · continuous rear support', (0, .008, -.126), (.264, .044, .031), phenolic, .0034)
box('Connector board · seated against molded support', (0, -.021, -.125), (.240, .012, .034), pcb, .0018)
for x, w in [(-.128, .014), (.125, .020)]:
    box('Polarized guide rail', (x, -.014, -.125), (w, .028, .035), phenolic, .0024)
box('Socket shoulder', (0, -.018, -.108), (.271, .052, .010), oxide, .0024)
box('Molded rear edge', (0, .028, -.135), (.234, .010, .010), phenolic, .0018)

contacts = []
for pin in range(32):
    x = (pin - 15.5) * .00715
    contacts.append(box('Hard gold finger', (x, -.0274, -.1272),
                        (.0048, .0016, .0254 if pin % 8 else .0277), gold, .0007))
join(contacts, '32 front plated contacts')
for x in [-.044, 0, .044]:
    cylinder('Amber retainer signal', (x, .021, -.106), .0031, .0025, spark)

frame_asset(.51)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'gut-punch-lower-management.blend'))
bpy.ops.export_scene.gltf(filepath=str(folder / 'gut-punch-lower-management.glb'),
                         export_format='GLB', export_yup=True, export_extras=True,
                         export_cameras=False, export_lights=False)
