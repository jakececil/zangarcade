"""Project matched orthographic references onto a reconstructed object."""
import bpy


VIEWS = (
    ('Front reference', 'shell-dense.projection.png', (0, -1, 0)),
    ('Rear reference', 'shell-rear.projection.png', (0, 1, 0)),
    ('Left reference', 'left.projection.png', (-1, 0, 0)),
    ('Right reference', 'right.projection.png', (1, 0, 0)),
    ('Top reference', 'top.projection.png', (0, 0, 1)),
    ('Underside reference', 'bottom.projection.png', (0, 0, -1)),
)


def create_projectors(mesh, coords, lo, span):
    layers = [mesh.uv_layers.new(name=name) for name, _, _ in VIEWS]
    for loop in mesh.loops:
        x, y, z = coords[loop.vertex_index]
        u, depth, v = (x-lo.x)/span.x, (y-lo.y)/span.y, (z-lo.z)/span.z
        for layer, uv in zip(layers, ((u, v), (1-u, v), (1-depth, v), (depth, v),
                                      (u, depth), (u, 1-depth))):
            layer.data[loop.index].uv = uv


def remove_projectors(mesh):
    for name, _, _ in VIEWS:
        layer = mesh.uv_layers.get(name)
        if layer:
            mesh.uv_layers.remove(layer)


def project(nodes, links, normal, image, layer, direction, previous):
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
    side = direction[1] == 0
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


def bake_reference_atlas(obj, material, folder, *, size, basename,
                         color=(.029, .072, .089, 1), face_priority=False):
    atlas = obj.data.uv_layers.new(name='Baked reference UV')
    obj.data.uv_layers.active = atlas
    atlas.active_render = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.10, island_margin=.010, correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    material.use_nodes = True
    obj.data.materials.clear()
    obj.data.materials.append(material)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    output = nodes.get('Material Output')
    paint = obj.data.color_attributes.active_color
    if paint:
        base_color = nodes.new('ShaderNodeVertexColor')
        base_color.layer_name = paint.name
    else:
        base_color = nodes.new('ShaderNodeRGB')
        base_color.outputs[0].default_value = color
    normal = nodes.new('ShaderNodeNewGeometry').outputs['Normal']
    surface = base_color.outputs[0]
    projection_order = VIEWS[2:] + VIEWS[:2] if face_priority else VIEWS
    for layer, filename, direction in projection_order:
        path = folder / filename
        if path.is_file():
            surface = project(nodes, links, normal, path, layer, direction, surface)

    emission = nodes.new('ShaderNodeEmission')
    links.new(surface, emission.inputs[0])
    links.new(emission.outputs[0], output.inputs['Surface'])
    baked = nodes.new('ShaderNodeTexImage')
    baked.image = bpy.data.images.new(basename, width=size, height=size)
    nodes.active = baked
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.device = 'CPU'
    bpy.context.scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=10)
    baked.image.filepath_raw = str(folder / (basename + '.jpg'))
    baked.image.file_format = 'JPEG'
    baked.image.save()
    baked.image = bpy.data.images.load(baked.image.filepath_raw, check_existing=False)
    baked.image.pack()
    links.new(baked.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(bsdf.outputs[0], output.inputs['Surface'])
    return baked.image
