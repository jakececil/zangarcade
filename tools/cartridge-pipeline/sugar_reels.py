"""Fit articulated candy reels and a working side lever into a reconstructed case."""

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def finish(name,rgb,metal,roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb,1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = roughness
    return material


def frosted_box(name,position,size,material,edge=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    obj = bpy.context.object
    obj.name = name
    for vertex in obj.data.vertices:
        vertex.co = tuple(component*extent for component,extent in zip(vertex.co,size))
    obj.data.materials.append(material)
    bevel = obj.modifiers.new('Rounded housing edges','BEVEL')
    bevel.width = edge
    bevel.segments = 3
    obj.modifiers.new('Weighted housing normals','WEIGHTED_NORMAL')
    return obj


def rotate_about_x(name, position, radius, depth, material, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = position
    obj.rotation_euler.y = math.pi/2
    obj.data.materials.append(material)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices)==4
    return obj


def build_reel(index,x,z,radius,material,spindle):
    pivot = bpy.data.objects.new(f'Candy reel {index+1} axle',None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (x,0,z)
    pivot['sugarReel'] = index
    steps_per_face = 10
    count = 6*steps_per_face
    angles = [math.tau*i/count-math.pi/6 for i in range(count)]
    half = .043
    vertices = [(axis,-radius*math.cos(angle),radius*math.sin(angle))
                for axis in (-half,half) for angle in angles]
    faces = [(i,i+count,(i+1)%count+count,(i+1)%count) for i in range(count)]
    data = bpy.data.meshes.new('Curved candy strip')
    data.from_pydata(vertices,[],faces)
    obj = bpy.data.objects.new(f'Printed cylinder {index+1}',data)
    bpy.context.collection.objects.link(obj)
    obj.parent = pivot
    obj.data.materials.append(material)
    channel = data.uv_layers.new(name='Candy face UV')
    for face in data.polygons:
        symbol,step = divmod(face.index,steps_per_face)
        low,high = step/steps_per_face,(step+1)/steps_per_face
        u0,u1 = (symbol+.012)/6,(symbol+.988)/6
        for loop,uv in zip(face.loop_indices,((u0,low),(u1,low),(u1,high),(u0,high))):
            channel.data[loop].uv = uv
        face.use_smooth = True
    for edge in (-.044,.044):
        rotate_about_x('Gold reel bearing rim',(edge,0,0),radius+.0004,.0025,spindle,pivot)
    pivot['cartridgeShadow'] = 'both'


def fit_sugar_slots(shell,folder):
    gold = finish('Turned champagne brass',(.73,.42,.136),.88,.24)
    plum = finish('Deep aubergine reel chamber',(.035,.010,.049),.07,.57)
    ruby = finish('Candy ruby handle',(.68,.020,.16),.27,.24)
    print_ink = finish('Enamel symbols on flexible reel tape',(.58,.31,.37),.04,.58)
    nodes = print_ink.node_tree.nodes
    art = nodes.new('ShaderNodeTexImage')
    art.image = bpy.data.images.load(str(folder/'reel-symbols.jpg'))
    art.image.pack()
    print_ink.node_tree.links.new(art.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
    lamps = finish('Matched-candy lamp lenses',(.54,.039,.21),.16,.23)
    shader = lamps.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (1,.145,.38,1)
    shader.inputs['Emission Strength'].default_value = .035

    edit = bmesh.new()
    edit.from_mesh(shell.data)
    hull_x = .211
    bmesh.ops.bisect_plane(edit,geom=list(edit.verts)+list(edit.edges)+list(edit.faces),
                          dist=.0001,plane_co=(hull_x,0,0),plane_no=(1,0,0),clear_outer=True)
    side = [edge for edge in edit.edges if edge.is_boundary
            and all(abs(v.co.x-hull_x)<.0002 for v in edge.verts)]
    bmesh.ops.holes_fill(edit,edges=side)
    remaining = set(edit.verts)
    components = []
    while remaining:
        pending = [remaining.pop()]
        component = []
        while pending:
            vertex = pending.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    pending.append(neighbor)
        components.append(component)
    casing = max(components,key=len)
    bmesh.ops.delete(edit,geom=[v for part in components if part is not casing for v in part],context='VERTS')
    edit.to_mesh(shell.data)
    edit.free()
    shell.data.update()

    z = .035
    centers = [-.108,-.004,.100]
    for i,x in enumerate(centers):
        wall = frosted_box('Reel window tool',(x,-.042,z),(.093,.176,.124),plum,.0031)
        bpy.ops.object.modifier_apply(modifier=wall.modifiers[0].name)
        bpy.ops.object.select_all(action='DESELECT')
        shell.select_set(True)
        bpy.context.view_layer.objects.active = shell
        cut = shell.modifiers.new(f'Recessed reel window {i+1}','BOOLEAN')
        cut.operation = 'DIFFERENCE'
        cut.object = wall
        bpy.ops.object.modifier_apply(modifier=cut.name)
        bpy.data.objects.remove(wall,do_unlink=True)
        build_reel(i,x,z,.0515,print_ink,gold)
    frosted_box('Recessed dark backing for reels',(-.003,.0515,z),(.306,.010,.129),plum,.003)
    for x in [-.157,-.056,.049,.149]:
        frosted_box('Gold window mullion',(x,-.051,z),(.007,.010,.131),gold,.0020)
    for end in (-.028,.100):
        frosted_box('Gold window sill',(-.004,-.051,end),(.316,.010,.007),gold,.0022)

    tree = BVHTree.FromObject(shell,bpy.context.evaluated_depsgraph_get())
    for x in (-.177,.168):
        for gz in [-.025,.004,.033,.062,.091]:
            hit = tree.ray_cast(Vector((x,-.5,gz)),Vector((0,1,0)),1)[0]
            if hit is None:
                continue
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.0063,
                                                 location=(x,hit.y-.0022,gz))
            obj = bpy.context.object
            obj.name = 'Embedded candy match lamp'
            obj.scale.y = .57
            obj['sugarLamp'] = True
            obj.data.materials.append(lamps)
    rotate_about_x('Fixed brass hinge',(.216,.007,.018),.022,.020,gold)
    lever = bpy.data.objects.new('Sugar Drum pull lever pivot',None)
    bpy.context.collection.objects.link(lever)
    lever.location = (.233,.007,.018)
    lever['sugarLever'] = True
    lever['cartridgeShadow'] = 'both'
    rotate_about_x('Moving lever hub',(0,0,0),.014,.018,gold,lever)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.0058,depth=.125)
    stem = bpy.context.object
    stem.parent = lever
    stem.name = 'Solid gold lever stem'
    stem.location.z = .068
    stem.data.materials.append(gold)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=.022)
    knob = bpy.context.object
    knob.parent = lever
    knob.name = 'Faceted raspberry lever knob'
    knob.location.z = .138
    knob.data.materials.append(ruby)
    shell['cartridgeShadow'] = 'both'
    shell['opticalDisplay'] = True
