"""Fit the clear Trashland casting and fragments into Little Company's strata."""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from material_zones import map_texture, pixels, smooth


def clip_at_waterline(mesh, z, *, keep_upper):
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.bisect_plane(edit, geom=list(edit.verts)+list(edit.edges)+list(edit.faces),
                          dist=.00007, plane_co=(0,0,z), plane_no=(0,0,1),
                          clear_inner=keep_upper, clear_outer=not keep_upper)
    seam = [edge for edge in edit.edges if edge.is_boundary
            and all(abs(vertex.co.z-z)<.00016 for vertex in edge.verts)]
    bmesh.ops.holes_fill(edit, edges=seam, sides=0)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()


def polymer(name, rgb, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb,1)
    shader.inputs['Roughness'].default_value = roughness
    return material


def add_floating_scraps(water, seam):
    palette = [
        polymer('Cherry bottle cap',(.86,.032,.19),.36),
        polymer('Lilac packing strip',(.58,.22,.83),.36),
        polymer('Tangerine shard',(.91,.27,.015),.48),
        polymer('Ivory wrapper',(.89,.81,.51),.43),
        polymer('Acid green plastic',(.44,.75,.04),.39),
    ]
    tree = BVHTree.FromObject(water,bpy.context.evaluated_depsgraph_get())
    maximum = max(v.co.z for v in water.data.vertices)
    width = max(abs(v.co.x) for v in water.data.vertices)
    rng = np.random.default_rng(730)
    placed = []

    def inside_casting(position):
        x,y,z = position
        front = tree.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)[0]
        back = tree.ray_cast(Vector((x,.5,z)),Vector((0,-1,0)),1)[0]
        return front is not None and back is not None and front.y+.0007 < y < back.y-.0007

    for i, x_norm in enumerate(np.linspace(-.73,.73,13)):
        x = x_norm * width
        z = seam + (maximum-seam)*rng.uniform(.34,.74)
        front = tree.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)[0]
        back = tree.ray_cast(Vector((x,.5,z)),Vector((0,-1,0)),1)[0]
        if front is None or back is None or back.y-front.y < .022:
            continue
        y = front.y + rng.uniform(.31,.64)*(back.y-front.y)
        length = rng.uniform(.0070,.0130)
        taper = rng.uniform(.0027,.0061)
        if i%4 == 0:
            bpy.ops.mesh.primitive_cylinder_add(vertices=14,radius=length*.71,depth=taper*.65)
            item = bpy.context.object
            item.scale.z = 1.2
        else:
            bpy.ops.mesh.primitive_cube_add(size=1)
            item = bpy.context.object
            for vertex in item.data.vertices:
                vx,vy,vz = vertex.co
                vertex.co = (vx*2*length,vy*taper, (vz+.25*vx)*length)
        item.rotation_euler = tuple(rng.uniform(-math.pi*.23,math.pi*.23,3))
        item.location = (x,y,z)
        for attempt in range(4):
            bpy.context.view_layer.update()
            if all(inside_casting(item.matrix_world @ vertex.co) for vertex in item.data.vertices):
                break
            if attempt < 3:
                item.scale *= .77
        else:
            bpy.data.objects.remove(item,do_unlink=True)
            continue
        item.name = f'Trashland scrap {i+1}'
        item.data.materials.append(palette[i%len(palette)])
        edge = item.modifiers.new('Tumbled edge','BEVEL')
        edge.width = .00078
        edge.segments = 2
        item['cartridgeShadow'] = 'both'
        placed.append(item)
    if len(placed) < 4:
        raise ValueError('The water casting has too little inner space for the debris')
    print(f'Placed {len(placed)} colored offcuts inside the cast water volume.',flush=True)


def fit_water_cap(shell, atlas, folder, level, height, waterline):
    if not .53 < waterline < .88:
        raise ValueError('Waterline must leave room for the cast water and lower strata')
    z = -.143 + waterline*height
    water = shell.copy()
    water.name = 'Trashland · solid cast water cap'
    water.data = shell.data.copy()
    bpy.context.collection.objects.link(water)
    clip_at_waterline(water.data,z,keep_upper=True)
    clip_at_waterline(shell.data,z,keep_upper=False)
    if 'cartridgeShadow' in water:
        del water['cartridgeShadow']
    water['opticalDisplay'] = True

    finish = polymer('Clear water casting with a clouded bed',(.68,.91,1),.19)
    water.data.materials.clear()
    water.data.materials.append(finish)
    nodes,links = finish.node_tree.nodes,finish.node_tree.links
    shader = nodes.get('Principled BSDF')
    tint = np.array([.63,.89,1])
    original = np.clip(pixels(atlas)[...,:3],0,1)
    haze = 1-smooth(waterline+.013,waterline+.105,level)
    milk = np.random.default_rng(661).random(haze.shape,dtype=np.float32)
    dye = tint*(.76+.14*milk[...,None])+.16*original
    tex = map_texture(nodes,folder,'water-tint.jpg','Turquoise cast water',dye,color=True)
    links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    optics = map_texture(nodes,folder,'water-optics.png','Bed haze and transmission',
                         np.stack((.95-.51*haze,.074+.28*haze,np.zeros_like(haze)),axis=-1))
    channels = nodes.new('ShaderNodeSeparateColor')
    links.new(optics.outputs['Color'],channels.inputs[0])
    links.new(channels.outputs['Red'],shader.inputs['Transmission Weight'])
    links.new(channels.outputs['Green'],shader.inputs['Roughness'])
    shader.inputs['IOR'].default_value = 1.46
    shader.inputs['Coat Weight'].default_value = .14
    shader.inputs['Coat Roughness'].default_value = .13

    group = bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Thickness',in_out='INPUT',socket_type='NodeSocketFloat')
    volume = nodes.new('ShaderNodeGroup')
    volume.node_tree = group
    volume.inputs[0].default_value = .017
    absorption = nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (.18,.68,.92,1)
    absorption.inputs['Density'].default_value = 17
    links.new(absorption.outputs[0],nodes.get('Material Output').inputs['Volume'])
    bpy.context.view_layer.update()
    add_floating_scraps(water,z)
    return water
