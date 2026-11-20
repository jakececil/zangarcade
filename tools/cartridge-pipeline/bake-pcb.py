"""Fit and bake a reusable cartridge PCB from the six-view reconstruction."""
import argparse
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import frame_asset, import_reconstruction, smoothstep
from material_zones import height_atlas, map_texture, pixels, smooth
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('--width', type=float, default=.248)
parser.add_argument('--height', type=float, default=.201)
parser.add_argument('--depth', type=float, default=.022)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
folder = args.folder.resolve()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
board = import_reconstruction(folder / 'shell-dense.glb', native_gltf=True)
board.name = 'ZANG PCB · routed edge-card'
coords = [vertex.co.copy() for vertex in board.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
span = hi - lo
center = (lo + hi)/2
edge = [v.x for v in coords if v.z < lo.z + .12*span.z]
origin_x = (min(edge) + max(edge))/2
create_projectors(board.data, coords, lo, span)

for vertex, (x, y, z) in zip(board.data.vertices, coords):
    level = (z-lo.z)/span.z
    x = (x-origin_x)*args.width/span.x
    y = (y-center.y)*args.depth/span.y
    # Keep the continuous laminate slim where it enters the handheld slot.
    y *= .34 + .66*smoothstep(.19, .31, level)
    vertex.co = (x, y, -.143 + level*args.height)
decimate = board.modifiers.new('Reduce reconstructed PCB triangles', 'DECIMATE')
decimate.ratio = min(.85, 48000/len(board.data.polygons))
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in board.data.polygons:
    face.use_smooth = True

material = bpy.data.materials.new('Fiberglass, copper, and edge plating')
atlas = bake_reference_atlas(board, material, folder, size=1024, basename='pcb-albedo',
                             color=(.027, .10, .057, 1))
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
r, g, b = np.moveaxis(np.clip(pixels(atlas)[:, :, :3], 0, 1)**(1/2.2), -1, 0)
copper = smooth(.047, .19, r-g)*smooth(.07, .22, r-b)*smooth(.25, .57, r)
gold = smooth(.04, .21, g-b)*smooth(.08, .22, r-g)*smooth(.37, .66, g)
level = height_atlas(material, *atlas.size, args.height)
# The front gold plating gets a stronger metallic response than the routed
# copper. Restrict it to the edge and preserve the dark gaps between pads.
pad = (1-smooth(.188, .213, level))*smooth(.014, .085, r-g)*smooth(.09, .20, g-b)
pad *= smooth(.22, .45, g)
metal = np.maximum(np.maximum(.72*copper, .94*gold), .99*pad)
roughness = .55 - .27*metal - .095*pad
finish = map_texture(nodes, folder, 'pcb-finish.png', 'Copper and gold B · roughness G',
                     np.stack((np.ones_like(metal), roughness, metal), axis=-1))
channels = nodes.new('ShaderNodeSeparateColor')
links.new(finish.outputs['Color'], channels.inputs[0])
links.new(channels.outputs['Green'], bsdf.inputs['Roughness'])
links.new(channels.outputs['Blue'], bsdf.inputs['Metallic'])
laminate = bpy.data.materials.new('Unplated connector back')
laminate.use_nodes = True
substrate = laminate.node_tree.nodes.get('Principled BSDF')
substrate.inputs['Base Color'].default_value = (.026, .095, .048, 1)
substrate.inputs['Roughness'].default_value = .53
board.data.materials.append(laminate)
contact_top = -.143 + .195*args.height
for face in board.data.polygons:
    if face.center.z < contact_top and face.normal.y >= -.1:
        face.material_index = 1
board['Source'] = 'Hunyuan3D-2mv with six orthographic texture projections'
board['Connector'] = 'Centered on X, Z=-.143 in Blender, Y=-.143 in glTF'
frame_asset(.45)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'zang-pcb.blend'))
remove_projectors(board.data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'zang-pcb.glb'), export_format='GLB',
                         export_yup=True, export_extras=True, export_vertex_color='NONE',
                         export_cameras=False, export_lights=False)
