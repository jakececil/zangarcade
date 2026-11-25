"""Replace Lighthouse Keeper's projected title with a seated oval enamel badge."""

import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset
from material_zones import map_texture, pixels, smooth
from reference_bake import remove_projectors
from relief_lighting import reference_coordinates


folder, serif = (Path(value).resolve() for value in sys.argv[sys.argv.index('--')+1:])
shell = next(obj for obj in bpy.context.scene.objects
             if obj.type == 'MESH' and obj.name.startswith('lighthouse-keeper'))
material = shell.data.materials[0]
nodes, links = material.node_tree.nodes, material.node_tree.links
shader = nodes.get('Principled BSDF')
atlas = shader.inputs['Base Color'].links[0].from_node.image
bpy.ops.object.select_all(action='DESELECT')
shell.select_set(True)
bpy.context.view_layer.objects.active = shell

u, v, face = reference_coordinates(material, *atlas.size)
mask = (smooth(.23,.71,face)*(1-smooth(.159,.194,v))
        * (1-smooth(.337,.439,np.abs(u-.5))))
rgb = np.clip(pixels(atlas)[..., :3],0,1)
navy = np.array([.019,.036,.096])
clean = map_texture(nodes, folder, 'unlettered-enamel.jpg', 'Clean badge seat',
                    rgb*(1-mask[..., None])+navy*mask[..., None], color=True)
links.new(clean.outputs['Color'], shader.inputs['Base Color'])

radius_x, radius_z, center = .145, .033, -.086
segments = 96
tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())


def depth(x, z):
    hit = tree.ray_cast(Vector((x,-.6,z)),Vector((0,1,0)),1.2)[0]
    if hit is None:
        raise ValueError(f'Oval edge is unsupported at ({x:.3f}, {z:.3f})')
    return hit.y


outline = [(radius_x*math.cos(angle), radius_z*math.sin(angle))
           for angle in (math.tau*i/segments for i in range(segments))]
seat = [depth(x,center+z) for x,z in outline]
face_y = min(depth(x*scale,center+z*scale) for x,z in outline for scale in (0,.5,1))-.0016


def finish(name,rgb,roughness,metal,coat=.10):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    bsdf = result.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb,1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    return result


enamel = finish('Midnight navy oval enamel',(.016,.037,.102),.32,.10)
brass = finish('Satin champagne brass lip',(.67,.46,.24),.29,.75)
lettering = finish('Raised warm ivory letters',(.95,.78,.47),.38,.21)
profile = [(1.0,seat), (1.0,face_y+.0019), (.985,face_y-.00065),
           (.947,face_y-.00065), (.927,face_y)]
vertices = [(x*scale,y[i]+.0004 if isinstance(y,list) else y,center+z*scale)
            for scale,y in profile for i,(x,z) in enumerate(outline)]
faces = [tuple(range(segments))]
for ring in range(len(profile)-1):
    start = ring*segments
    for i in range(segments):
        a,b = start+i,start+(i+1)%segments
        faces.append((a,b,b+segments,a+segments))
faces.append(tuple(range(len(vertices)-segments,len(vertices))))
data = bpy.data.meshes.new('Recessed oval with separate rolled brass lip')
data.from_pydata(vertices,[],faces)
edit = bmesh.new()
edit.from_mesh(data)
bmesh.ops.recalc_face_normals(edit,faces=list(edit.faces))
edit.to_mesh(data)
edit.free()
badge = bpy.data.objects.new('Seated oval title medallion',data)
bpy.context.collection.objects.link(badge)
badge.parent = shell
for part in (enamel,brass):
    data.materials.append(part)
for polygon in data.polygons:
    polygon.material_index = 0 if polygon.index in (0,len(data.polygons)-1) else 1

font = bpy.data.fonts.load(str(serif), check_existing=True)
for title,width,z in [('LIGHTHOUSE',.218,center+.0105),('KEEPER',.146,center-.012)]:
    typeface = bpy.data.curves.new(title,'FONT')
    typeface.body = title
    typeface.font = font
    typeface.align_x = typeface.align_y = 'CENTER'
    typeface.size = .027
    typeface.space_character = 1.04
    typeface.extrude = .00022
    typeface.bevel_depth = .00013
    word = bpy.data.objects.new(title+' · raised type',typeface)
    bpy.context.collection.objects.link(word)
    word.location = (0,face_y-.00035,z)
    word.rotation_euler.x = math.pi/2
    typeface.materials.append(lettering)
    bpy.context.view_layer.update()
    typeface.size *= min(1,width/word.dimensions.x)
    bpy.ops.object.select_all(action='DESELECT')
    word.select_set(True)
    bpy.context.view_layer.objects.active = word
    bpy.ops.object.convert(target='MESH')
    bpy.context.object.parent = badge
frame_asset(.76)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'lighthouse-keeper.blend'))
remove_projectors(shell.data)
bpy.ops.export_scene.gltf(filepath=str(folder/'lighthouse-keeper.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_lights=False, export_cameras=False)
