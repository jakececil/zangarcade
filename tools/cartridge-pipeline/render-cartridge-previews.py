"""Render the assembled GLBs for the CSS case and slot animations."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def add_softbox(scene, title, offset, target, power, size, color):
    light = bpy.data.lights.new(title, 'AREA')
    light.energy = power
    light.size = size
    light.color = color
    obj = bpy.data.objects.new(title, light)
    scene.collection.objects.link(obj)
    obj.location = target + Vector(offset)
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


def render(path, folder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    for obj in scene.objects:
        if 'sugarReel' in obj:
            obj.rotation_euler.x += obj['sugarReel'] * math.tau / 3
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(point) for obj in scene.objects if obj.type == 'MESH'
               for point in obj.bound_box]
    bottom, top = min(v.z for v in corners), max(v.z for v in corners)
    span = max(2 * max(abs(v.x) for v in corners), top-bottom)
    # Center on the shared connector, including on asymmetric cartridges.
    target = Vector((0, 0, (bottom+top)/2))
    data = bpy.data.cameras.new('Cartridge preview')
    data.type = 'ORTHO'
    data.ortho_scale = 1.12*span
    scene.camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(scene.camera)
    scene.camera.location = target + Vector((0, -1.6, .22))
    scene.camera.rotation_euler = (target-scene.camera.location).to_track_quat('-Z', 'Y').to_euler()

    scene.world = bpy.data.worlds.new('Ambient fill')
    scene.world.use_nodes = True
    ambient = scene.world.node_tree.nodes.get('Background')
    ambient.inputs['Color'].default_value = (.68, .73, .80, 1)
    ambient.inputs['Strength'].default_value = .29
    add_softbox(scene, 'Warm key', (-.48, -.68, .64), target, 20, .55, (1, .88, .72))
    add_softbox(scene, 'Edge light', (.46, .19, .40), target, 14, .39, (.68, .83, 1))
    add_softbox(scene, 'Front fill', (.25, -.70, -.18), target, 4, .50, (.78, .91, 1))

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.render.resolution_x = scene.render.resolution_y = 544
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(folder / (path.stem+'.png'))
    bpy.ops.render.render(write_still=True)
    print('Rendered ' + path.stem, flush=True)


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('models', type=Path, nargs='+')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
folder = args.folder.resolve()
folder.mkdir(parents=True, exist_ok=True)
for filename in args.models:
    render(filename.resolve(), folder)
