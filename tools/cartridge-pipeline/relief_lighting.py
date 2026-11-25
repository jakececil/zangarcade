"""Shape emissive accents on a reconstructed front relief in reference space."""

import json

import bpy
import numpy as np

from material_zones import map_texture, pixels, smooth


def reference_coordinates(material, width, height):
    """Read the original front projection and facing weight at the baked UVs."""
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    shader = nodes.get('Principled BSDF')
    image = bpy.data.images.new('Temporary front coordinates', width, height, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    front = nodes.new('ShaderNodeUVMap')
    front.uv_map = 'Front reference'
    uv = nodes.new('ShaderNodeSeparateXYZ')
    links.new(front.outputs['UV'], uv.inputs[0])
    geometry = nodes.new('ShaderNodeNewGeometry')
    facing = nodes.new('ShaderNodeVectorMath')
    facing.operation = 'DOT_PRODUCT'
    facing.inputs[1].default_value = (0,-1,0)
    links.new(geometry.outputs['Normal'], facing.inputs[0])
    color = nodes.new('ShaderNodeCombineColor')
    links.new(uv.outputs['X'], color.inputs['Red'])
    links.new(uv.outputs['Y'], color.inputs['Green'])
    links.new(facing.outputs['Value'], color.inputs['Blue'])
    emissive = nodes.new('ShaderNodeEmission')
    links.new(color.outputs['Color'], emissive.inputs[0])
    links.new(emissive.outputs[0], output.inputs['Surface'])
    nodes.active = target
    bpy.ops.object.bake(type='EMIT', margin=10)
    result = pixels(image)[..., :3].copy()
    links.new(shader.outputs[0], output.inputs['Surface'])
    for node in (target, front, uv, geometry, facing, color, emissive):
        nodes.remove(node)
    bpy.data.images.remove(image)
    return np.moveaxis(result, -1, 0)


def coat_relief(material, atlas, folder, style):
    layout = json.loads((folder / 'relief.json').read_text(encoding='utf-8'))
    u, v, facing = reference_coordinates(material, *atlas.size)
    front = smooth(.08,.56,facing)
    albedo = np.clip(pixels(atlas)[..., :3], 0, 1)
    r, g, b = (albedo**(1/2.2)).transpose(2,0,1)
    warm = smooth(.06,.24,r-b)*smooth(.04,.19,g-b)*smooth(.31,.72,g)
    zinc = smooth(.18,.36,g-r)*smooth(.28,.57,b)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')

    if style == 'cosmic-loop':
        cx, cy = layout['center']
        rx, ry = layout['radius']
        distance = np.hypot((u-cx)/rx, (v-cy)/ry)
        near = 1-smooth(1.03,1.85,distance)
        level = warm*front*near*smooth(.69,.95,distance)
        hot = 1-smooth(.86,1.24,distance)
        glow = level[..., None]*np.stack((np.ones_like(hot), .30+.57*hot, .046+.42*hot), axis=-1)
        soot = (1-smooth(.87,1.19,distance))*front*(1-smooth(.10,.39,np.maximum.reduce((r,g,b))))
        color = albedo*(1-soot[..., None])+.00065*soot[..., None]
        roughness = (.38+.24*smooth(.06,.28,g-r)-.16*warm)*(1-soot)+.98*soot
        metal = .28*warm*(1-soot)
        specular = .5-.485*soot
        strength = 2.45
    else:
        sx, sy = layout['lantern']
        ex, ey = layout['beam_end']
        length = np.hypot(ex-sx,ey-sy)
        dx, dy = (ex-sx)/length, (ey-sy)/length
        along = ((u-sx)*dx+(v-sy)*dy)/length
        across = np.abs((u-sx)*dy-(v-sy)*dx)
        span = layout['beam_width']
        beam = (1-smooth(span*.22,span,across))*smooth(-.035,.035,along)*(1-smooth(.81,1.06,along))
        lantern = np.exp(-((u-sx)/.028)**2-((v-sy)/.031)**2)
        intensity = front*warm*np.maximum(.97*lantern, .76*beam*(1-.53*np.clip(along,0,1)))
        glow = intensity[..., None]*np.array([1,.63,.23])
        sea = smooth(.045,.24,b-r)*smooth(.24,.62,b)
        roughness = .57-.30*sea-.16*warm
        metal = zinc*.22
        specular = np.full_like(metal,.5)
        strength = 2.0
        rear_contacts = (1-front)*(1-smooth(.074,.096,v))*(1-smooth(.22,.27,np.abs(u-.5)))*warm
        navy = np.array([.018,.026,.064])
        color = albedo*(1-rear_contacts[..., None])+navy*rear_contacts[..., None]

    surface = map_texture(nodes, folder, 'relief-finish.png', 'Relief specular, roughness, and metal',
                          np.stack((specular, np.clip(roughness,.16,1), metal), axis=-1))
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(surface.outputs['Color'], channels.inputs[0])
    links.new(channels.outputs['Green'], shader.inputs['Roughness'])
    links.new(channels.outputs['Blue'], shader.inputs['Metallic'])
    if style == 'cosmic-loop':
        links.new(channels.outputs['Red'], shader.inputs['Specular IOR Level'])
    shader.inputs['Coat Weight'].default_value = .055 if style == 'cosmic-loop' else .12
    dye = map_texture(nodes, folder, 'relief-albedo.jpg', 'Local relief albedo', color, color=True)
    links.new(dye.outputs['Color'], shader.inputs['Base Color'])
    emission = map_texture(nodes, folder, 'relief-emission.jpg', 'Light in the molded relief', glow, color=True)
    links.new(emission.outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = strength
