"""Plant short mesh fibers directly on the green sections of a baked shell."""

import math

import bpy
import numpy as np

from material_zones import pixels


def plant_turf(shell, atlas):
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
    turf = (green > red+.035) & (green > blue+.065) & (green > .19) & (roots[:, 2] > -.101)
    roots, selected, pigment = roots[turf], selected[turf], pigment[turf]
    if len(roots) < 1000:
        raise ValueError('Too little green surface for the turf pile')

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
            length = rng.uniform(.0036, .0084)
            width = rng.uniform(.00066, .00123)
            root = origin + .00013*normal
            elbow = root + normal*length*.52 + forward*length*.15
            tip = root + normal*length + forward*length*rng.uniform(.29, .72)
            step = len(vertices)
            vertices.extend((root-across*width, root+across*width,
                             elbow+across*width*.62, elbow-across*width*.62, tip))
            faces.extend(((step, step+1, step+2, step+3), (step+3, step+2, step+4)))
            blade = np.clip(.47*albedo + rng.uniform(.69,1.28)*np.array([.063,.28,.012]), 0, 1)
            colors.extend([(*(.48*blade),1)]*2 + [(*(.82*blade),1)]*2 + [(*blade,1)])

    data = bpy.data.meshes.new('Woven synthetic turf blades')
    data.from_pydata(vertices, [], faces)
    data.update()
    layer = data.color_attributes.new(name='Root to tip', type='BYTE_COLOR', domain='POINT')
    layer.data.foreach_set('color', np.asarray(colors, dtype=np.float32).ravel())
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    finish = bpy.data.materials.new('Two-sided green polyethylene fibers')
    finish.use_nodes = True
    shader = finish.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .61
    shader.inputs['Specular IOR Level'].default_value = .27
    pigment = finish.node_tree.nodes.new('ShaderNodeVertexColor')
    pigment.layer_name = layer.name
    finish.node_tree.links.new(pigment.outputs['Color'], shader.inputs['Base Color'])
    obj.data.materials.append(finish)
    obj['cartridgeShadow'] = 'both'
    shell['cartridgeShadow'] = 'both'
    print(f'{len(roots):,} turf tufts with two mesh fibers each.', flush=True)
