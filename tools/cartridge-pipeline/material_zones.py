"""Build a metallic/roughness atlas for candy plastic, hardware and grafts."""
import bpy
import numpy as np


def smooth(low, high, values):
    t = np.clip((values-low)/(high-low), 0, 1)
    return t*t*(3-2*t)


def pixels(image):
    width, height = image.size
    buffer = np.empty(width*height*4, dtype=np.float32)
    image.pixels.foreach_get(buffer)
    return buffer.reshape(height, width, 4)


def map_texture(nodes, folder, filename, label, rgb, *, color=False):
    height, width, _ = rgb.shape
    image = bpy.data.images.new(label, width, height, alpha=False)
    if not color:
        image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(folder / filename)
    image.file_format = 'JPEG' if color else 'PNG'
    image.save()
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.label = label
    return texture


def height_atlas(material, width, height, object_height):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    bsdf = nodes.get('Principled BSDF')
    height_image = bpy.data.images.new('Temporary object height', width, height, alpha=False, float_buffer=True)
    height_image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage')
    target.image = height_image
    geometry = nodes.new('ShaderNodeNewGeometry')
    xyz = nodes.new('ShaderNodeSeparateXYZ')
    normalize = nodes.new('ShaderNodeMath')
    normalize.operation = 'MULTIPLY_ADD'
    normalize.inputs[1].default_value = 1/object_height
    normalize.inputs[2].default_value = .143/object_height
    emission = nodes.new('ShaderNodeEmission')
    links.new(geometry.outputs['Position'], xyz.inputs[0])
    links.new(xyz.outputs['Z'], normalize.inputs[0])
    links.new(normalize.outputs[0], emission.inputs[0])
    links.new(emission.outputs[0], output.inputs['Surface'])
    nodes.active = target
    bpy.ops.object.bake(type='EMIT', margin=10)
    level = pixels(height_image)[:, :, 0].copy()
    links.new(bsdf.outputs[0], output.inputs['Surface'])
    for node in (target, geometry, xyz, normalize, emission):
        nodes.remove(node)
    bpy.data.images.remove(height_image)
    return level


def candy_graft_material(material, surface_image, folder, shell_height):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    width, height = surface_image.size
    level = height_atlas(material, width, height, shell_height)
    linear = np.clip(pixels(surface_image)[:, :, :3], 0, 1)
    r, g, b = np.moveaxis(linear**(1/2.2), -1, 0)
    bright = .29*r + .57*g + .14*b
    worn = np.abs(bright - (np.roll(bright, 1, 0)+np.roll(bright, -1, 0)+
                           np.roll(bright, 1, 1)+np.roll(bright, -1, 1))/4)

    gold = smooth(.04, .16, r-g)*smooth(.070, .21, g-b)*smooth(.19, .52, g)
    contact = (1-smooth(.126, .169, level))*gold
    claw = smooth(.67, .84, level)*gold
    metal = np.maximum(.97*contact, .83*claw)
    graft = smooth(.52, .67, level)
    bone = graft*smooth(.53, .76, g)*smooth(.29, .54, b)*(1-claw)
    purple = graft*smooth(.04, .21, b-g)*smooth(.02, .13, r-g)
    teal = smooth(.045, .24, np.maximum(g, b)-r)
    matte = np.maximum(bone, np.maximum(.83*purple, .53*teal))
    roughness = .28 + .34*matte + np.clip(worn*.58, 0, .105)
    grain = np.random.default_rng(417).normal(0, .028, roughness.shape)
    roughness = np.clip(roughness*(1-metal) + (.27+2*grain)*metal + grain, .16, .79)
    orm = np.ones((height, width, 4), dtype=np.float32)
    orm[:, :, 1] = roughness
    orm[:, :, 2] = metal
    image = bpy.data.images.new('Metal contacts and material zones', width, height, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(orm.ravel())
    image.filepath_raw = str(folder / 'shell-material-zones.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(texture.outputs['Color'], channels.inputs[0])
    links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['Coat Weight'].default_value = .075


def compacted_scrap_material(material, atlas, folder, shell_height):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    level = height_atlas(material, *atlas.size, shell_height)
    r, g, b = np.moveaxis(np.clip(pixels(atlas)[:, :, :3], 0, 1)**(1/2.2), -1, 0)
    brightness = .23*r + .64*g + .13*b
    color_span = np.maximum.reduce((r, g, b)) - np.minimum.reduce((r, g, b))
    gold = smooth(.02, .14, r-g)*smooth(.07, .25, g-b)*smooth(.24, .51, g)
    contacts = (1-smooth(.078, .126, level))*gold
    bare_steel = smooth(.28, .68, brightness)*(1-smooth(.066, .24, color_span))
    metal = np.maximum(.99*contacts, .77*bare_steel)
    tooling = 1-smooth(.16, .39, brightness)
    scuffs = np.random.default_rng(513).normal(0, .021, level.shape)
    roughness = np.clip(.39 + .18*tooling - .25*metal + scuffs, .15, .69)
    atlas_node = map_texture(nodes, folder, 'scrap-finish.png', 'Salvage and plating B · roughness G',
                             np.stack((np.ones_like(metal), roughness, metal), axis=-1))
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(atlas_node.outputs['Color'], channels.inputs[0])
    links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['Coat Weight'].default_value = .12


def artifact_material(material, atlas, folder, shell_height, style):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    level = height_atlas(material, *atlas.size, shell_height)
    linear = np.clip(pixels(atlas)[:, :, :3], 0, 1)
    r, g, b = np.moveaxis(linear**(1/2.2), -1, 0)
    gold = smooth(.023, .136, r-g)*smooth(.04, .17, g-b)*smooth(.17, .48, g)
    pins = (1-smooth(.078, .124, level))*gold

    if style == 'gilt-enamel':
        metal = np.maximum(.985*pins, .90*smooth(.085, .235, r-b)*smooth(.023, .17, g-b))
        darkness = 1-smooth(.15, .40, .24*r+.61*g+.15*b)
        roughness = .34 + .14*darkness - .15*metal
        coat = .10
    elif style == 'creek-stone':
        moss = smooth(.018, .17, g-r)*smooth(.032, .25, g-b)
        water = smooth(.035, .18, b-r)*smooth(.050, .22, g-r)*(1-moss)
        metal = .99*pins
        roughness = .61 + .22*moss - .35*water - .32*pins
        coat = .026
    elif style == 'aquarium-enamel':
        brass = smooth(.04, .20, r-g)*smooth(.10, .25, g-b)*smooth(.17, .45, g)
        vitreous = smooth(.046, .26, np.maximum(g, b)-r)
        coral = smooth(.045, .22, r-g)*smooth(.016, .12, b-g)
        metal = np.maximum(.99*pins, .80*brass)
        roughness = .37 - .19*vitreous - .10*brass + .13*coral
        coat = .23
    else:
        pink = smooth(.05, .24, r-g)*smooth(.018, .15, b-g)
        lime = smooth(.06, .22, g-b)*smooth(.30, .72, g)
        mint = smooth(.05, .23, g-r)*smooth(.08, .45, b)
        metal = .99*pins
        roughness = .51 - .31*np.maximum(pink, lime) - .115*mint - .26*pins
        coat = .22
    wear = np.random.default_rng(317).normal(0, .014, level.shape)
    finish = map_texture(nodes, folder, 'artifact-finish.png', 'Surface roughness G · metal B',
                         np.stack((np.ones_like(metal), np.clip(roughness+wear, .19, .89), metal), axis=-1))
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(finish.outputs['Color'], channels.inputs[0])
    links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['Coat Weight'].default_value = coat
