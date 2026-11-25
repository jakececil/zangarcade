"""Trace the candy lettering and seat real gems on the reconstructed drum case."""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from sugar_reels import finish


# Contours on the front projection, in image pixels. The inner paths are
# the letter counters. The cast caps share the original candy artwork.
GLYPHS = (
    ('S', [(107,65),(134,55),(154,58),(162,67),(158,84),(148,84),(140,76),(128,77),
           (122,84),(126,89),(148,87),(160,95),(160,110),(150,121),(130,128),(104,128),
           (90,122),(93,112),(104,105),(118,102),(124,108),(139,103),(133,98),(119,100),(104,94),(101,82)], []),
    ('U', [(169,62),(187,57),(197,59),(196,72),(195,92),(199,97),(205,96),(208,87),(207,66),
           (211,57),(222,55),(227,59),(222,75),(224,91),(219,103),(206,110),(187,113),(174,108),(170,98),(170,78)], []),
    ('G', [(241,55),(259,50),(278,53),(286,59),(286,68),(279,74),(268,67),(256,68),(249,77),
           (249,88),(254,95),(264,96),(268,91),(261,89),(260,81),(270,77),(286,78),(290,84),
           (284,94),(281,104),(269,111),(251,110),(236,103),(229,90),(228,77),(233,64)], []),
    ('A', [(301,56),(324,57),(331,62),(333,79),(341,99),(340,109),(334,115),(322,112),(315,102),
           (313,97),(304,96),(299,106),(290,109),(283,106),(287,96),(293,80),(295,68)], [[(307,78),(305,89),(314,90),(313,79)]]),
    ('R', [(350,59),(368,58),(387,63),(397,71),(399,83),(392,92),(385,94),(391,104),(401,104),
           (412,109),(414,117),(408,124),(397,127),(383,123),(373,115),(366,100),(366,110),
           (359,117),(349,114),(345,107),(348,96),(348,78),(344,66)], [[(367,72),(366,86),(378,87),(383,80),(377,75)]]),
    ('D', [(123,137),(143,128),(164,126),(181,129),(188,138),(186,151),(179,165),(164,176),(140,185),
           (120,191),(115,186),(119,174),(123,160),(125,147)], [[(146,147),(143,170),(157,165),(165,157),(166,148),(158,144)]]),
    ('R', [(194,129),(211,123),(230,123),(242,130),(244,141),(239,151),(231,155),(238,163),(246,168),
           (244,176),(233,180),(224,177),(214,164),(211,163),(209,175),(202,181),(191,178),(189,172),
           (193,156),(194,139)], [[(213,135),(210,150),(221,150),(228,142),(224,136)]]),
    ('U', [(250,123),(264,121),(271,124),(271,145),(273,158),(280,162),(285,160),(289,151),(287,129),
           (292,122),(302,121),(309,127),(305,140),(307,155),(303,169),(292,179),(276,181),(260,175),
           (251,165),(251,151),(249,136)], []),
    ('M', [(317,127),(331,126),(341,135),(350,149),(360,136),(371,129),(383,132),(388,139),(382,151),
           (382,165),(387,180),(387,189),(376,192),(364,186),(363,174),(363,161),(355,173),(346,174),
           (336,159),(335,175),(328,182),(317,179),(312,172),(317,157),(318,141),(314,133)], [])
)


def fit_title_and_gems(shell, folder, width, height, center):
    image = bpy.data.images.load(str(folder/'shell-dense.projection.png'), check_existing=True)
    image.pack()
    tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    face = finish('Satin bicolour candy lettering',(.93,.23,.33),.18,.09)
    nodes = face.node_tree.nodes
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    projected_uv = nodes.new('ShaderNodeUVMap')
    projected_uv.uv_map = 'Front candy projection'
    face.node_tree.links.new(projected_uv.outputs['UV'], texture.inputs['Vector'])
    shader = nodes.get('Principled BSDF')
    shader.inputs['Coat Weight'].default_value = .34
    face.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    side = finish('Cherry red letter bevel',(.46,.014,.062),.24,.23)
    gold = finish('Brass jewel bezels',(.68,.37,.09),.26,.83)
    ruby = finish('Faceted pink candy gems',(.75,.014,.19),.16,.29)
    ruby.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .46

    def point(pixel):
        x,z = pixel
        return (x/image.size[0]-center)*width, -.143+(1-z/image.size[1])*height

    def depth(x,z):
        hit = tree.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)[0]
        return hit.y if hit is not None else None

    for i,(name,outline,counters) in enumerate(GLYPHS):
        paths = [[point(pixel) for pixel in ring] for ring in (outline,*counters)]
        x_middle = sum(x for x,_ in paths[0])/len(paths[0])
        z_middle = sum(z for _,z in paths[0])/len(paths[0])
        surface = [depth(x,z) for x,z in paths[0]+[(x_middle,z_middle)]]
        surface = [y for y in surface if y is not None]
        if len(surface) < 3:
            raise ValueError(f'Letter {name} has no seat on the casting')
        front = min(surface)-.0026
        curve = bpy.data.curves.new(f'Candy letter {i+1} {name}', 'CURVE')
        curve.dimensions = '2D'
        curve.fill_mode = 'BOTH'
        curve.resolution_u = 4
        curve.extrude = max(.003, min(.010, (max(surface)-front)*.48))
        curve.bevel_depth = .001
        curve.bevel_resolution = 2
        for j,ring in enumerate(paths):
            area = sum(x1*z2-x2*z1 for (x1,z1),(x2,z2) in zip(ring,ring[1:]+ring[:1]))
            if (area < 0) != (j > 0):
                ring = list(reversed(ring))
            spline = curve.splines.new('BEZIER')
            spline.bezier_points.add(len(ring)-1)
            spline.use_cyclic_u = True
            for control,(x,z) in zip(spline.bezier_points,ring):
                control.co = (x-x_middle,z-z_middle,0)
                control.handle_left_type = control.handle_right_type = 'AUTO'
        obj = bpy.data.objects.new(curve.name,curve)
        bpy.context.collection.objects.link(obj)
        obj.location = (x_middle,front+curve.extrude,z_middle)
        obj.rotation_euler.x = math.pi/2
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        data = obj.data
        data.materials.append(face)
        data.materials.append(side)
        uv = data.uv_layers.new(name='Front candy projection')
        uv.active_render = True
        for polygon in data.polygons:
            polygon.material_index = 0 if polygon.normal.z > .38 else 1
            for index in polygon.loop_indices:
                x,z,_ = data.vertices[data.loops[index].vertex_index].co
                uv.data[index].uv = (center+(x+x_middle)/width, (z+z_middle+.143)/height)
        obj['cartridgeShadow'] = 'both'

    for px,pz,radius in [(156,414,.016),(252,414,.019),(348,414,.016)]:
        x,z = point((px,pz))
        surface_y = depth(x,z)
        if surface_y is None:
            raise ValueError('Gem does not sit on the casting')
        bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,
                                       major_radius=radius,minor_radius=.0023,
                                       location=(x,surface_y-.001,z),rotation=(math.pi/2,0,0))
        bezel = bpy.context.object
        bezel.name = 'Rolled brass gem bezel'
        bezel.data.materials.append(gold)
        bezel['cartridgeShadow'] = 'both'
        for polygon in bezel.data.polygons:
            polygon.use_smooth = True
        rings = ((.93,.0030,0),(.96,-.003,.0),(.70,-.009,math.pi/10),(.43,-.013,0))
        vertices = [(x+r*radius*math.cos(i*math.tau/10+phase),surface_y+y,
                     z+r*radius*math.sin(i*math.tau/10+phase))
                    for r,y,phase in rings for i in range(10)]
        polys = [tuple(range(9,-1,-1))]
        for ring in range(len(rings)-1):
            for i in range(10):
                a,b = 10*ring+i,10*ring+(i+1)%10
                if ring == 0:
                    polys.append((a,b,b+10,a+10))
                else:
                    polys.extend(((a,b,a+10),(b,b+10,a+10)))
        polys.append(tuple(range(30,40)))
        mesh = bpy.data.meshes.new('Cut candy facets')
        mesh.from_pydata(vertices,[],polys)
        gem = bpy.data.objects.new('Raised pink candy jewel',mesh)
        bpy.context.collection.objects.link(gem)
        mesh.materials.append(ruby)
        gem['cartridgeShadow'] = 'both'
