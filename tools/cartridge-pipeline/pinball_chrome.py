"""Seat a chrome pinball in the recovered pocket of the salvage shell."""

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def seat_chrome_ball(shell):
    coords = [vertex.co for vertex in shell.data.vertices]
    left,right = min(v.x for v in coords),max(v.x for v in coords)
    bottom,top = min(v.z for v in coords),max(v.z for v in coords)
    x,z = left + .87*(right-left), bottom + .81*(top-bottom)
    tree = BVHTree.FromObject(shell,bpy.context.evaluated_depsgraph_get())
    hit = tree.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)[0]
    if hit is None:
        raise ValueError('Could not locate the chrome pinball pocket')
    radius = .023
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=radius,
                                         location=(x,hit.y+.56*radius,z))
    ball = bpy.context.object
    ball.name = 'Mirror chrome silver ball'
    ball['cartridgeShadow'] = 'both'
    ball['opticalDisplay'] = True
    material = bpy.data.materials.new('Mirror chrome')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.77,.817,.875,1)
    shader.inputs['Metallic'].default_value = 1
    shader.inputs['Roughness'].default_value = .105
    ball.data.materials.append(material)
    for face in ball.data.polygons:
        face.use_smooth = True
