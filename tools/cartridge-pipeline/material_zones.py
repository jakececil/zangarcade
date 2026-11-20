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


def candy_graft_material(material, surface_image, folder, shell_height):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    bsdf = nodes.get('Principled BSDF')
    width, height = surface_image.size

    # Bake object height into the same atlas. Color can then distinguish the
    # gold contacts below the shell from similarly colored wear in the plastic.
    height_image = bpy.data.images.new('Temporary shell height', width, height, alpha=False, float_buffer=True)
    height_image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage')
    target.image = height_image
    geometry = nodes.new('ShaderNodeNewGeometry')
    xyz = nodes.new('ShaderNodeSeparateXYZ')
    normalize = nodes.new('ShaderNodeMath')
    normalize.operation = 'MULTIPLY_ADD'
    normalize.inputs[1].default_value = 1/shell_height
    normalize.inputs[2].default_value = .143/shell_height
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
