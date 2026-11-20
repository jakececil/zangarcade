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
