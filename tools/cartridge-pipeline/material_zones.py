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
    elif style == 'rebound-equipment':
        orange_leather = (smooth(.12, .36, r-b)*smooth(.025, .18, g-b)
                          * smooth(.36, .61, level))
        turquoise_rubber = smooth(.038, .22, np.maximum(g,b)-r)
        pink_nylon = smooth(.065, .24, r-g)*smooth(.026, .21, b-g)
        brightness = .25*r + .60*g + .15*b
        saturation = np.maximum.reduce((r,g,b))-np.minimum.reduce((r,g,b))
        exposed_metal = (1-smooth(.07,.22,saturation))*smooth(.48,.75,brightness)
        metal = np.maximum(.99*pins, .59*exposed_metal)
        roughness = (.50+.28*orange_leather+.22*turquoise_rubber
                     -.23*pink_nylon-.27*metal)
        coat = .085
        grain = np.random.default_rng(713).normal(0, .16, level.shape).astype(np.float32)
        strength = .12+.58*orange_leather+.16*turquoise_rubber
        dx = (np.roll(grain,1,axis=1)-grain)*strength
        dy = (np.roll(grain,1,axis=0)-grain)*strength
        relief = map_texture(nodes, folder, 'rebound-grain.png', 'Pebbled leather and rubber grain',
                             np.stack((.5+dx,.5+dy,np.ones_like(dx)), axis=-1))
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .4
        links.new(relief.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    elif style == 'tufted-course':
        green = smooth(.024,.13,g-r)*smooth(.026,.16,g-b)
        teal = smooth(.034,.23,np.minimum(g,b)-r)
        metal = .99*pins
        roughness = .67+.24*green-.22*teal-.42*pins
        coat = .051
    elif style == 'flocked-brass':
        brass = smooth(.09,.36,r-b)*smooth(.045,.22,g-b)*smooth(.14,.52,g)
        brass *= 1-smooth(.57,.78,level)
        plush = smooth(.48,.72,level)*smooth(-.20,.06,b-r)
        metal = np.maximum(.99*pins, .81*brass)
        roughness = .48+.39*plush-.18*metal
        coat = .051
    elif style == 'stratified-world':
        earth_band = smooth(.27,.43,level)*(1-smooth(.49,.65,level))
        gold_city = smooth(.05,.25,r-b)*smooth(.045,.20,g-b)*smooth(.40,.65,g)
        metal = np.maximum(.98*pins, .45*gold_city*smooth(.41,.57,level))
        roughness = .44+.38*earth_band-.16*metal
        coat = .08
        violet = smooth(.05,.23,b-g)*smooth(.04,.26,r-g)
        deep = smooth(.10,.18,level)*(1-smooth(.27,.34,level))
        field = (violet*deep)[...,None]*np.array([.56,.055,.88])
        glow = map_texture(nodes, folder, 'strata-emission.jpg', 'A little Gut Punch glow', field, color=True)
        links.new(glow.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = .83
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
    return level


def molded_playset_parts(shell, material, atlas, shell_height):
    """Assign discrete plastic finishes without cutting away the recovered seams."""
    mesh = shell.data
    uv = np.empty(len(mesh.loops)*2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    centers = np.array([uv[face.loop_start:face.loop_start + face.loop_total].mean(axis=0)
                        for face in mesh.polygons])
    width, height = atlas.size
    x, y = np.clip(centers*[width-1,height-1], 0, [width-1,height-1]).astype(int).T
    r, g, b = (np.clip(pixels(atlas)[y,x,:3], 0, 1)**(1/2.2)).T
    z = np.array([(face.center.z+.143)/shell_height for face in mesh.polygons])
    brightness = np.maximum.reduce((r,g,b))
    color_span = brightness-np.minimum.reduce((r,g,b))
    zones = [
        ('Snap-fit butter-yellow planter', .34, .24, np.ones_like(z, dtype=bool)),
        ('Deep blue terrarium tray', .54, .12, (brightness < .32) | ((b > r+.03) & (g < .30))),
        ('Leaf-green rail and stems', .38, .17, (g > r+.027) & (g > b+.06)),
        ('Cyan choir bubble', .23, .34, (g > r+.10) & (b > r+.12) & (g > .32)),
        ('Lavender caterpillar and inlays', .45, .16, (b > g+.047) & (r > g+.011) & (b > .32)),
        ('Cherry caps and pink moldings', .29, .29, (r > g+.13) & (b > g+.037)),
        ('Tangerine flower petals', .32, .25, (r > g+.105) & (g > b+.065) & (z > .37)),
        ('Cream letters and eyes', .41, .11, (r > .67) & (g > .62) & (b > .50) & (color_span < .34)),
    ]
    assignments = np.zeros(len(centers), dtype=np.int32)
    for index, (name, roughness, coat, mask) in enumerate(zones):
        piece = material.copy() if index else material
        piece.name = name
        shader = piece.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = roughness
        shader.inputs['Coat Weight'].default_value = coat
        shader.inputs['Coat Roughness'].default_value = min(.33, roughness)
        if index:
            mesh.materials.append(piece)
        assignments[mask] = index
    mesh.polygons.foreach_set('material_index', assignments)
    shell['opticalDisplay'] = True
