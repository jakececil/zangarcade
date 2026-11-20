"""Blender helpers for the shared ZANG cartridge coordinate frame."""
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def smoothstep(low, high, value):
    t = min(1, max(0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def import_reconstruction(path, *, native_gltf=False):
    bpy.ops.import_scene.gltf(filepath=str(path))
    shell = next(obj for obj in bpy.context.selected_objects if obj.type == 'MESH')
    bpy.ops.object.select_all(action='DESELECT')
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if not native_gltf:
        for vertex in shell.data.vertices:
            x, y, z = vertex.co
            vertex.co = (z, -x, -y)
    shell.data.update()
    return shell


def open_pcb_window(shell, board, top):
    """Recess the front contacts and seat the PCB against a molded backing."""
    contacts = [v.co for v in board.data.vertices if v.co.z <= top]
    if not contacts:
        raise ValueError('PCB window must reach above the edge-card tip')
    left, right = min(v.x for v in contacts) - .002, max(v.x for v in contacts) + .002
    if max(abs(left), abs(right)) > .129:
        raise ValueError('PCB window leaves too little room for the connector rails')
    bottom = -.175
    front, recess = -.09, max(v.y for v in contacts) + .0014
    bpy.ops.mesh.primitive_cube_add(size=1, location=((left+right)/2, (front+recess)/2, (top+bottom)/2))
    cutter = bpy.context.object
    cutter.dimensions = (right-left, recess-front, top-bottom)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cutter.select_set(False)
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    opening = shell.modifiers.new('Expose the PCB contact edge', 'BOOLEAN')
    opening.operation = 'DIFFERENCE'
    opening.object = cutter
    bpy.ops.object.modifier_apply(modifier=opening.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    board.parent = shell

    toe = min(v.z for v in contacts)
    tip = [v for v in contacts if v.z < toe + .014]
    heel_left, heel_right = min(v.x for v in tip)-.003, max(v.x for v in tip)+.003
    shoulder = top + .023
    # The molded saddle runs behind the contact row. Two taller ears hold
    # the board shoulders while leaving the routed area above them visible.
    profile = [
        (heel_left, toe+.001), (heel_right, toe+.001), (heel_right, top-.005),
        (right, top+.002), (right, shoulder), (right-.016, shoulder),
        (right-.020, top+.007), (left+.020, top+.007), (left+.016, shoulder),
        (left, shoulder), (left, top+.002), (heel_left, top-.005),
    ]
    rear_seat = max(v.y for v in tip) - .0006
    count = len(profile)
    verts = [(x, y, z) for y in (rear_seat, recess+.005) for x, z in profile]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2*count)))]
    for i in range(count):
        next_index = (i+1) % count
        faces.append((i, i+count, next_index+count, next_index))
    mesh = bpy.data.meshes.new('Molded connector saddle')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    backing = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(backing)
    backing.parent = shell
    backing['cartridgeShadow'] = 'both'
    bevel = backing.modifiers.new('Molded edge radius', 'BEVEL')
    bevel.width = .0014
    bevel.segments = 3
    material = bpy.data.materials.new('Mineral-filled teal support plastic')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.025, .132, .103, 1)
    shader.inputs['Roughness'].default_value = .48
    mesh.materials.append(material)


def fit_label(shell, image_path, *, width, height, z, radius, bulge, x=0):
    """Make a rounded UV-mapped laminate fitted to the shell's front surface."""
    tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    columns, rows = 38, 26
    vertices, uv, faces = [], [], []
    for row in range(rows + 1):
        local_z = height * (row / rows - .5)
        corner = max(0, abs(local_z) - (height / 2 - radius))
        half_width = width / 2 - radius + math.sqrt(max(0, radius**2 - corner**2))
        for column in range(columns + 1):
            local_x = half_width * (2 * column / columns - 1)
            point, _, _, _ = tree.ray_cast(Vector((x + local_x, -1, z + local_z)), Vector((0, 1, 0)), 2)
            if point is None:
                raise ValueError('Label footprint crosses outside the reconstructed shell')
            dome = max(0, 1 - (2 * local_x / width)**2 - (2 * local_z / height)**2)
            vertices.append((x + local_x, point.y - .0007 - dome * bulge, z + local_z))
            uv.append((local_x / width + .5, row / rows))
            if row < rows and column < columns:
                i = row * (columns + 1) + column
                faces.append((i, i + 1, i + columns + 2, i + columns + 1))

    data = bpy.data.meshes.new('Label surface')
    data.from_pydata(vertices, [], faces)
    data.update()
    layer = data.uv_layers.new(name='Label UV')
    for loop in data.loops:
        layer.data[loop.index].uv = uv[loop.vertex_index]
    for polygon in data.polygons:
        polygon.use_smooth = True
    label = bpy.data.objects.new('Replaceable printed laminate', data)
    bpy.context.collection.objects.link(label)
    label.parent = shell
    thickness = label.modifiers.new('Paper and adhesive', 'SOLIDIFY')
    thickness.thickness = .0004
    thickness.offset = -1

    material = bpy.data.materials.new('Printed label')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .61
    shader.inputs['Coat Weight'].default_value = .13
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(image_path))
    texture.image.pack()
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    data.materials.append(material)
    return label


def frame_asset(distance=.78):
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            view = area.spaces.active
            view.region_3d.view_distance = distance
            view.region_3d.view_location = (0, 0, .013)
            view.region_3d.view_rotation = Vector((.20, -1, .11)).to_track_quat('Z', 'Y')
            view.overlay.show_overlays = False
            view.shading.type = 'MATERIAL'
