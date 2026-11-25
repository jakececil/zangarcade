"""Plant short mesh fibers on colored sections of a baked shell."""

import math

import bpy
import numpy as np

from material_zones import pixels


def plant_turf(shell, atlas):
    return add_pile(shell, atlas, cloud=False)


def flock_clouds(shell, atlas):
    return add_pile(shell, atlas, cloud=True)


def add_pile(shell, atlas, *, cloud):
    mesh = shell.data
    mesh.calc_loop_triangles()
    triangles = mesh.loop_triangles
    points = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', points)
    points = points.reshape(-1, 3)
    corners = np.asarray([triangle.vertices[:] for triangle in triangles])
    texture_loops = np.asarray([triangle.loops[:] for triangle in triangles])
    surface = points[corners]
    area = np.linalg.norm(np.cross(surface[:, 1]-surface[:, 0],
                                   surface[:, 2]-surface[:, 0]), axis=1)
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    rng = np.random.default_rng(2745)
    selected = rng.choice(len(triangles), size=21000, p=area/area.sum())
    a, b = rng.random((2, len(selected)))
    a = np.sqrt(a)
    weights = np.stack((1-a, a*(1-b), a*b), axis=-1)
    roots = (surface[selected]*weights[..., None]).sum(axis=1)
    coords = (uv[texture_loops[selected]]*weights[..., None]).sum(axis=1)
    width, height = atlas.size
    columns, rows = np.clip(coords*[width-1, height-1], 0, [width-1, height-1]).astype(int).T
    pigment = np.clip(pixels(atlas)[rows, columns, :3], 0, 1)
    red, green, blue = (pigment**(1/2.2)).T
    if cloud:
        low, high = points[:, 2].min(), points[:, 2].max()
        level = (roots[:, 2]-low)/(high-low)
        light = np.maximum.reduce((red,green,blue))
        fibers = (level > .54) & (light > .37) & (blue > red-.230) & (blue > green-.14)
        lengths, widths = (.00125,.0039), (.00039,.00076)
        tint = np.array([.66,.69,.77])
        name = 'Short flock fibers on the weather puffs'
    else:
        fibers = (green > red+.035) & (green > blue+.065) & (green > .19) & (roots[:, 2] > -.101)
        lengths, widths = (.0036,.0084), (.00066,.00123)
        tint = np.array([.063,.28,.012])
        name = 'Woven synthetic turf blades'
    roots, selected, pigment = roots[fibers], selected[fibers], pigment[fibers]
    if len(roots) < 1000:
        raise ValueError('Too little surface area for the selected fiber pile')

    vertices, faces, colors = [], [], []
    for origin, index, albedo in zip(roots, selected, pigment):
        normal = np.asarray(triangles[int(index)].normal)
        axis = [0, 0, 1] if abs(normal[2]) < .9 else [1, 0, 0]
        tangent = np.cross(normal, axis)
        tangent /= np.linalg.norm(tangent)
        bitangent = np.cross(normal, tangent)
        for _ in range(2):
            angle = rng.uniform(0, math.tau)
            across = math.cos(angle)*tangent + math.sin(angle)*bitangent
            forward = np.cross(normal, across)
            length = rng.uniform(*lengths)
            width = rng.uniform(*widths)
            root = origin + .00013*normal
            elbow = root + normal*length*.52 + forward*length*.15
            tip = root + normal*length + forward*length*rng.uniform(.29, .72)
            step = len(vertices)
            vertices.extend((root-across*width, root+across*width,
                             elbow+across*width*.62, elbow-across*width*.62, tip))
            faces.extend(((step, step+1, step+2, step+3), (step+3, step+2, step+4)))
            if cloud:
                blade = np.clip(.78*albedo + rng.uniform(.16,.29)*tint, 0, 1)
            else:
                blade = np.clip(.47*albedo + rng.uniform(.69,1.28)*tint, 0, 1)
            colors.extend([(*(.48*blade),1)]*2 + [(*(.82*blade),1)]*2 + [(*blade,1)])

    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    layer = data.color_attributes.new(name='Root to tip', type='BYTE_COLOR', domain='POINT')
    layer.data.foreach_set('color', np.asarray(colors, dtype=np.float32).ravel())
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    finish = bpy.data.materials.new('Two-sided polyester flock' if cloud else 'Two-sided green polyethylene fibers')
    finish.use_nodes = True
    shader = finish.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .81 if cloud else .61
    shader.inputs['Specular IOR Level'].default_value = .16 if cloud else .27
    if cloud:
        shader.inputs['Sheen Weight'].default_value = .23
        shader.inputs['Sheen Roughness'].default_value = .68
    pigment = finish.node_tree.nodes.new('ShaderNodeVertexColor')
    pigment.layer_name = layer.name
    finish.node_tree.links.new(pigment.outputs['Color'], shader.inputs['Base Color'])
    obj.data.materials.append(finish)
    obj['cartridgeShadow'] = 'both'
    shell['cartridgeShadow'] = 'both'
    print(f'{name}: {2*len(roots):,} mesh fibers.', flush=True)
