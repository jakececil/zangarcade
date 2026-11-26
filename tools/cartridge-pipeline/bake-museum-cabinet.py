"""Bake a multiview upright cabinet at museum scale, with +Y up in the GLB."""

import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction
from material_zones import map_texture, pixels, smooth
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors
from relief_lighting import reference_coordinates
from cabinet_details import clean_controls_from_atlas, mount_brackets, mount_controls


folder = Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
cabinet = import_reconstruction(folder/'shell-dense.glb', native_gltf=True)
cabinet.name = 'Gutter Cabinet · cast steel, CRT, and fungal buildup'
coordinates = [v.co.copy() for v in cabinet.data.vertices]
lo = Vector(tuple(min(v[i] for v in coordinates) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coordinates) for i in range(3)))
span = hi-lo
origin = (lo+hi)/2
origin.z = lo.z
create_projectors(cabinet.data, coordinates, lo, span)
for vert in cabinet.data.vertices:
    vert.co = tuple(value*extent/length
                    for value,extent,length in zip(vert.co-origin,(.87,.88,1.94),span))

decimate = cabinet.modifiers.new('Reduce reconstruction for the gallery', 'DECIMATE')
decimate.ratio = min(.85, 62000/len(cabinet.data.polygons))
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in cabinet.data.polygons:
    face.use_smooth = True

material = bpy.data.materials.new('Pitted steel, CRT glass and luminous marquee')
atlas = bake_reference_atlas(cabinet, material, folder, size=1536, basename='cabinet-atlas', face_priority=True)
u,v,facing = reference_coordinates(material, *atlas.size)
surface = pixels(atlas)[...,:3].clip(0,1)
face = smooth(.28,.73,facing)
screen = face*(1-smooth(.29,.36,np.abs(u-.50)))*smooth(.558,.587,v)*(1-smooth(.772,.795,v))
surface = clean_controls_from_atlas(surface,v,screen)
r,g,b = np.moveaxis(surface**(1/2.2), -1, 0)
growth = np.maximum(
    smooth(.022,.115,g-r)*smooth(.043,.16,g-b),
    smooth(.07,.30,r-g)*smooth(.10,.32,g-b))*(1-screen)
oxide = smooth(.11,.44,r-b)*smooth(.20,.48,r)
roughness = np.clip(.56 + .29*growth + .14*oxide - .37*screen, .17, .99)
metal = (.52 - .38*growth - .20*oxide)*(1-screen)
marquee = face*smooth(.82,.915,v)*smooth(.15,.5,u)*(1-smooth(.51,.86,u))
neon = marquee*smooth(.36,.82,g)*smooth(.14,.49,g-b)
amber = face*smooth(.77,.82,v)*(1-smooth(.84,.87,v))*smooth(.27,.76,r)*smooth(.15,.51,r-b)

nodes,links = material.node_tree.nodes,material.node_tree.links
shader = nodes.get('Principled BSDF')
color = map_texture(nodes,folder,'cabinet-clean.jpg','Clean six-view cabinet albedo',surface,color=True)
links.new(color.outputs['Color'],shader.inputs['Base Color'])
channels = nodes.new('ShaderNodeSeparateColor')
finish = map_texture(nodes,folder,'cabinet-finish.png','Roughness and metal by zone',
                     np.stack((np.zeros_like(roughness),roughness,metal),axis=-1))
links.new(finish.outputs['Color'],channels.inputs[0])
links.new(channels.outputs['Green'],shader.inputs['Roughness'])
links.new(channels.outputs['Blue'],shader.inputs['Metallic'])
emit = map_texture(nodes,folder,'cabinet-emission.jpg','Phosphor and filament spill',
                   neon[...,None]*np.array([.63,1,.046]) +
                   amber[...,None]*np.array([.8,.34,.046]),color=True)
links.new(emit.outputs['Color'],shader.inputs['Emission Color'])
shader.inputs['Emission Strength'].default_value = 1.25
shader.inputs['Coat Weight'].default_value = .085
shader.inputs['Coat Roughness'].default_value = .20

cabinet['Source'] = 'Hunyuan3D-2mv, six orthographic reference projections'
mount_controls(cabinet)
mount_brackets(cabinet)
frame_asset(3.5)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'gutter-cabinet.blend'))
remove_projectors(cabinet.data)
bpy.ops.export_scene.gltf(filepath=str(folder/'gutter-cabinet.glb'),export_format='GLB',
                         export_yup=True,export_apply=True,export_extras=True,
                         export_vertex_color='NONE',export_lights=False,export_cameras=False)
