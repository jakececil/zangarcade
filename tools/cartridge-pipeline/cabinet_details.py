"""Mechanical controls and shelf fungi fitted to the Gutter Cabinet casting."""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from material_zones import smooth


def clean_controls_from_atlas(rgb, height, screen):
    """Remove projected controls from the donor shell before fitting the hardware."""
    r, g, b = (rgb**(1/2.2)).transpose(2,0,1)
    belt = smooth(.43,.48,height)*(1-smooth(.612,.632,height))
    pink = smooth(.049,.19,r-g)*smooth(.005,.078,b-g)*smooth(.18,.48,r)
    mask = belt*pink
    tone = np.clip(.26*r + .64*g + .1*b,.15,.51)**2.2
    steel = tone[...,None]*np.array([.97,1,.93])
    olive = tone[...,None]*np.array([.58,.70,.36])
    clean = steel*(1-screen[...,None])+olive*screen[...,None]
    return rgb*(1-mask[...,None])+clean*mask[...,None]


def finish(name, base, roughness, metal=0, coat=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*base,1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Coat Roughness'].default_value = .19
    return material


def bevel(obj, material, name, radius):
    obj.name = name
    obj.data.materials.append(material)
    rounded = obj.modifiers.new('Soft machined edge','BEVEL')
    rounded.width = radius
    rounded.segments = 3
    obj.modifiers.new('Weighted hardware normals','WEIGHTED_NORMAL')
    return obj


def mount_controls(shell):
    tilt = math.atan(.35)
    normal = Vector((0,-math.sin(tilt),math.cos(tilt)))
    deck = lambda x, y: Vector((x,y,1.117+.35*y))
    # The old cast joystick reaches 1.15 m. Cut the raised details flush
    # within the metal insert, leaving the original sides and screen lip.
    bpy.ops.mesh.primitive_cube_add(size=1, location=deck(0,-.274) + normal*.092,
                                    rotation=(tilt,0,0))
    cutter = bpy.context.object
    cutter.dimensions = (.669,.330,.194)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    cut = shell.modifiers.new('Plane the control insert recess','BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.object = cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

    plate = finish('Graphite control plate',(.099,.105,.108),.40,.61,.19)
    gasket = finish('Satin black control gasket',(.016,.020,.024),.53,.03)
    nickel = finish('Brushed nickel lever shaft',(.43,.47,.50),.28,.84)
    cherry = finish('Cherry phenolic balltop',(.50,.009,.082),.18,.03,.46)
    cream = finish('Warm ivory nylon buttons',(.74,.64,.45),.33,.02,.17)
    amber = finish('Amber nylon action button',(.86,.48,.052),.25,.02,.22)

    bpy.ops.mesh.primitive_cube_add(size=1,location=deck(0,-.274) + normal*.003,
                                    rotation=(tilt,0,0))
    obj = bpy.context.object
    obj.dimensions = (.689,.347,.022)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel(obj,plate,'Beveled control insert',.008)

    def cylinder(name,x,y,offset,radius,height,material):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=radius,depth=height,
                                          location=deck(x,y)+normal*offset,rotation=(tilt,0,0))
        part = bevel(bpy.context.object,material,name,min(height*.26,.004))
        for face in part.data.polygons:
            face.use_smooth = len(face.vertices)==4

    x,y = -.207,-.337
    cylinder('Lever dust washer',x,y,.017,.062,.010,gasket)
    cylinder('Lever mounting collar',x,y,.022,.031,.013,nickel)
    cylinder('Lever shaft',x,y,.073,.013,.113,nickel)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=20,radius=.040,
                                       location=deck(x,y)+normal*.137)
    ball = bpy.context.object
    ball.name = 'Cherry joystick balltop'
    ball.data.materials.append(cherry)
    for face in ball.data.polygons:
        face.use_smooth = True

    for index,(x,y) in enumerate(((-.012,-.321),(.075,-.311),(.162,-.309),(.249,-.323))):
        cylinder(f'Button {index+1} mounting ring',x,y,.019,.036,.011,gasket)
        cylinder(f'Button {index+1} nylon cap',x,y,.027,.0295,.017,amber if index==3 else cream)

    for x in (-.311,.311):
        for y in (-.399,-.149):
            cylinder('Flush nickel panel fastener',x,y,.016,.008,.005,nickel)


def mount_brackets(shell):
    tree = BVHTree.FromObject(shell,bpy.context.evaluated_depsgraph_get())
    clay = finish('Mushroom russet centre',(.20,.105,.062),.83)
    ochre = finish('Mushroom ochre growth line',(.31,.20,.112),.78)
    rose = finish('Mushroom mauve growth line',(.25,.14,.115),.83)
    cream = finish('Mushroom buff lip and pores',(.47,.33,.207),.88)
    specs = [
        (-.248,.261,.074,.053,-.30),(-.195,.312,.061,.046,.26),(-.230,.372,.102,.078,.13),
        (-.118,.441,.083,.061,-.31),(-.207,.483,.063,.051,.22),(-.143,.556,.102,.074,.17),
        (-.219,.614,.055,.049,-.22),(-.172,.676,.073,.055,.29),(-.235,.712,.047,.042,-.25)
    ]
    for index,(y,z,width,reach,lean) in enumerate(specs):
        hit = tree.ray_cast(Vector((-1,y,z)),Vector((1,0,0)),1.2)[0]
        if hit is None:
            raise ValueError('Mushroom attachment missed the left casting')
        anchor = hit + Vector((.015,0,0))
        outward = Vector((-1,lean,0)).normalized()
        across = Vector((outward.y,-outward.x,0))
        count = 23
        rings = (.06,.33,.54,.72,.90,1)
        vertices = []
        for lower in (False,True):
            for r in rings:
                for j in range(count):
                    theta = -1.42+2.84*j/(count-1)
                    wave = 1+.088*math.sin(7*theta+index)+.05*math.cos(11*theta-index)
                    belly = .012*math.sin(math.pi*r)+.007*math.cos(theta)
                    lip = .005*r**4*math.cos(6*theta+index)
                    thickness = .008+.008*(1-r)
                    point = anchor + outward*(reach*r*math.cos(theta)*wave)
                    point += across*(width*.63*r*math.sin(theta)*wave)
                    point.z += belly+lip-(thickness if lower else 0)
                    vertices.append(tuple(point))
        faces, zones = [], []
        sheet = len(rings)*count
        for lower in range(2):
            for band in range(len(rings)-1):
                for j in range(count-1):
                    a = lower*sheet+band*count+j
                    faces.append((a,a+1,a+count+1,a+count))
                    zones.append(3 if lower else (0,1,2,1,3)[band])
        border = list(range(count))
        border += [i*count+count-1 for i in range(1,len(rings))]
        border += list(range(sheet-2,sheet-count-1,-1))
        border += [i*count for i in range(len(rings)-2,0,-1)]
        for a,b in zip(border,border[1:]+border[:1]):
            faces.append((a,b,b+sheet,a+sheet))
            zones.append(3)
        mesh = bpy.data.meshes.new('Closed bracket cap and pore underside')
        mesh.from_pydata(vertices,[],faces)
        for material in (clay,ochre,rose,cream):
            mesh.materials.append(material)
        for polygon,zone in zip(mesh.polygons,zones):
            polygon.material_index = zone
            polygon.use_smooth = True
        edit = bmesh.new()
        edit.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(edit,faces=list(edit.faces))
        edit.to_mesh(mesh)
        edit.free()
        cap = bpy.data.objects.new(f'Left shelf fungus {index+1}',mesh)
        bpy.context.collection.objects.link(cap)
