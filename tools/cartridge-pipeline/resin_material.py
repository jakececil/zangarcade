"""Bake a cloudy solid casting with measured optical paths and opaque contacts."""
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

from material_zones import map_texture, pixels, smooth

MAX_PATH = .050
CAST_COLOR = (.29, .92, .69)


def optical_paths(shell, material, width, height, shell_height, board):
    shell.data.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(shell, depsgraph)
    board_tree = BVHTree.FromObject(board, depsgraph) if board else None
    paths = np.empty(len(shell.data.vertices), dtype=np.float32)
    board_hits = np.zeros_like(paths)
    for vertex in shell.data.vertices:
        inward = -vertex.normal
        start = vertex.co + inward*.0004
        _, _, _, distance = tree.ray_cast(start, inward, .12)
        if board_tree and distance is not None:
            _, _, _, board_distance = board_tree.ray_cast(start, inward, distance)
            if board_distance is not None:
                distance = board_distance
                board_hits[vertex.index] = 1
        depth = .006 if distance is None else distance + .0004
        paths[vertex.index] = min(MAX_PATH, max(.0018, depth)) / MAX_PATH

    name = 'Measured optical path'
    attribute = shell.data.attributes.new(name, 'FLOAT', 'POINT')
    attribute.data.foreach_set('value', paths)
    board_name = 'Optical path meets PCB'
    if board_tree:
        attribute = shell.data.attributes.new(board_name, 'FLOAT', 'POINT')
        attribute.data.foreach_set('value', board_hits)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    image = bpy.data.images.new('Temporary optical paths', width, height, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    depth = nodes.new('ShaderNodeAttribute')
    depth.attribute_name = name
    geometry = nodes.new('ShaderNodeNewGeometry')
    xyz = nodes.new('ShaderNodeSeparateXYZ')
    level = nodes.new('ShaderNodeMath')
    level.operation = 'MULTIPLY_ADD'
    level.inputs[1].default_value = 1/shell_height
    level.inputs[2].default_value = .143/shell_height
    channels = nodes.new('ShaderNodeCombineColor')
    emission = nodes.new('ShaderNodeEmission')
    links.new(geometry.outputs['Position'], xyz.inputs[0])
    links.new(xyz.outputs['Z'], level.inputs[0])
    links.new(depth.outputs['Fac'], channels.inputs['Red'])
    links.new(level.outputs[0], channels.inputs['Green'])
    board_surface = None
    if board_tree:
        board_surface = nodes.new('ShaderNodeAttribute')
        board_surface.attribute_name = board_name
        links.new(board_surface.outputs['Fac'], channels.inputs['Blue'])
    links.new(channels.outputs[0], emission.inputs[0])
    links.new(emission.outputs[0], output.inputs['Surface'])
    nodes.active = target
    bpy.ops.object.bake(type='EMIT', margin=10)
    measured = pixels(image)[:, :, :3].copy()
    links.new(nodes.get('Principled BSDF').outputs[0], output.inputs['Surface'])
    for node in (target, depth, geometry, xyz, level, channels, emission):
        nodes.remove(node)
    if board_surface:
        nodes.remove(board_surface)
    bpy.data.images.remove(image)
    return measured


def soft_noise(rng, width, height, scale):
    grid = rng.random((scale, scale), dtype=np.float32)
    x = np.linspace(0, scale-1, width)
    y = np.linspace(0, scale-1, height)
    rows = np.stack([np.interp(x, np.arange(scale), row) for row in grid])
    return np.stack([np.interp(y, np.arange(scale), col) for col in rows.T], axis=1)


def refractive_resin(shell, material, surface_image, folder, shell_height, *, board=None):
    width, height = surface_image.size
    path, level, board_coverage = np.moveaxis(
        optical_paths(shell, material, width, height, shell_height, board), -1, 0)
    linear = np.clip(pixels(surface_image)[:, :, :3], 0, 1)
    r, g, b = np.moveaxis(linear**(1/2.2), -1, 0)
    tongue = 1-smooth(.096, .146, level)
    gold = smooth(.018, .115, r-g)*smooth(.12, .32, g-b)*smooth(.24, .46, g)
    contact = tongue*gold
    rng = np.random.default_rng(502)
    cloud = smooth(.33, .73, .69*soft_noise(rng, width, height, 13) +
                   .31*soft_noise(rng, width, height, 58))
    grain = rng.random((height, width), dtype=np.float32)
    flecks = smooth(.967, .997, grain)*(.35 + .65*cloud)
    foam = smooth(.48, .85, .18*r + .62*g + .20*b)*smooth(.27, .71, r)
    cloud = np.clip(.51*cloud + .24*path + .36*foam, 0, 1)
    roughness = (.077 + .31*cloud + .06*flecks)*(1-tongue) + .32*tongue
    transmission = (.97 - .50*cloud)*(1-.93*tongue)*(1-contact)
    tint = np.array([.73, .97, .91])
    resin = tint*(.68 - .28*cloud[:, :, None]) + .37*linear + .10*flecks[:, :, None]
    color = resin*(1-tongue[:, :, None]) + linear*tongue[:, :, None]
    if board:
        # Narrow clear areas over the hardware preserve legibility while the
        # rest of the casting keeps its original, thicker cloudy finish.
        clarity = smooth(.08, .94, board_coverage)*(1-tongue)
        roughness *= 1-.70*clarity
        transmission += (.985-transmission)*.91*clarity
        rails = np.array([.032, .39, .27]) + .10*linear
        color = resin*(1-tongue[:, :, None]) + rails*tongue[:, :, None]
        transmission = (1-tongue)*transmission + tongue*(.81-.32*cloud)
        contact = np.zeros_like(contact)

    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    bsdf = nodes.get('Principled BSDF')
    albedo = map_texture(nodes, folder, 'resin-albedo.jpg', 'Turquoise casting', color, color=True)
    optical = map_texture(nodes, folder, 'resin-optics.png', 'Transmission R · optical path G',
                          np.stack((transmission, path, np.zeros_like(path)), axis=-1))
    surface = map_texture(nodes, folder, 'resin-surface.png', 'Roughness G · contact metal B',
                           np.stack((np.ones_like(path), roughness, .98*contact), axis=-1))
    optic_channels, surface_channels = (nodes.new('ShaderNodeSeparateColor') for _ in range(2))
    links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(optical.outputs['Color'], optic_channels.inputs[0])
    links.new(surface.outputs['Color'], surface_channels.inputs[0])
    links.new(optic_channels.outputs['Red'], bsdf.inputs['Transmission Weight'])
    links.new(surface_channels.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(surface_channels.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['IOR'].default_value = 1.47
    bsdf.inputs['Coat Weight'].default_value = .16
    bsdf.inputs['Coat Roughness'].default_value = .18

    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    volume = nodes.new('ShaderNodeGroup')
    volume.node_tree = group
    scale = nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = MAX_PATH
    links.new(optic_channels.outputs['Green'], scale.inputs[0])
    links.new(scale.outputs[0], volume.inputs['Thickness'])
    absorption = nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (.37, .92, .74, 1) if board else (*CAST_COLOR, 1)
    absorption.inputs['Density'].default_value = 1/.038
    scatter = nodes.new('ShaderNodeVolumeScatter')
    scatter.inputs['Color'].default_value = (.58, .86, .77, 1)
    scatter.inputs['Density'].default_value = 10
    scatter.inputs['Anisotropy'].default_value = .24
    volumes = nodes.new('ShaderNodeAddShader')
    links.new(absorption.outputs[0], volumes.inputs[0])
    links.new(scatter.outputs[0], volumes.inputs[1])
    links.new(volumes.outputs[0], output.inputs['Volume'])
    return absorption.outputs[0]
