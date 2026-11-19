"""Simplify the reconstructed ZONK shell and bake its local color and front reference."""
import sys
from pathlib import Path
from statistics import median

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction, smoothstep

folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
shell = import_reconstruction(folder / 'zonk-dense.glb')
shell.name = 'ZONK · reconstructed enamel shell'

low = Vector(tuple(min(v.co[i] for v in shell.data.vertices) for i in range(3)))
high = Vector(tuple(max(v.co[i] for v in shell.data.vertices) for i in range(3)))
center = (low + high) / 2
size = high - low
panel_depth = median(
    vertex.co.y for vertex in shell.data.vertices
    if .38 < (vertex.co.x - low.x) / size.x < .62
    and .43 < (vertex.co.z - low.z) / size.z < .62 and vertex.co.y < center.y
)
projection = shell.data.uv_layers.new(name='Front projection')
rear_projection = shell.data.uv_layers.new(name='Rear projection')
for loop in shell.data.loops:
    xyz = shell.data.vertices[loop.vertex_index].co
    u, v = (xyz.x - low.x) / size.x, (xyz.z - low.z) / size.z
    projection.data[loop.index].uv = (u, v)
    rear_projection.data[loop.index].uv = (1 - u, v)

# Keep the relief, but constrain the tab that enters the handheld to a shared envelope.
for vertex in shell.data.vertices:
    x, y, z = vertex.co
    across = (x - low.x) / size.x
    height = (z - low.z) / size.z
    if y < center.y:
        # Clean the noisy relief inside the blank label well and preserve the rim.
        inner_x = 1 - smoothstep(.215, .252, abs(across - .5))
        inner_z = 1 - smoothstep(.171, .205, abs(height - .525))
        y += (panel_depth - y) * inner_x * inner_z * .84
    x = (x - center.x) * .401 / size.x
    y = (y - center.y) * .097 / size.y
    z = -.143 + height * .319
    near_tab = 1 - smoothstep(.10, .18, height)
    x += (max(-.158, min(.158, x)) - x) * near_tab
    y += (max(-.031, min(.031, y)) - y) * near_tab
    vertex.co = (x, y, z)

original = len(shell.data.polygons)
decimate = shell.modifiers.new('Simplify generated surface', 'DECIMATE')
decimate.ratio = min(.9, 42000 / original)
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in shell.data.polygons:
    face.use_smooth = True
paint = shell.data.color_attributes.active_color or shell.data.color_attributes[0]
atlas = shell.data.uv_layers.new(name='Shell UV')
shell.data.uv_layers.active = atlas
atlas.active_render = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.08, island_margin=.015, correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')

material = bpy.data.materials.new('Glossy worn enamel and black Bakelite')
material.use_nodes = True
shell.data.materials.clear()
shell.data.materials.append(material)
nodes = material.node_tree.nodes
links = material.node_tree.links
principled = nodes.get('Principled BSDF')
output = nodes.get('Material Output')
vertex_color = nodes.new('ShaderNodeVertexColor')
vertex_color.layer_name = paint.name
reference_uv = nodes.new('ShaderNodeUVMap')
reference_uv.uv_map = 'Front projection'
reference = nodes.new('ShaderNodeTexImage')
reference.image = bpy.data.images.load(str(folder / 'zonk-dense.projection.png'))
reference.extension = 'CLIP'
links.new(reference_uv.outputs['UV'], reference.inputs['Vector'])

normal = nodes.new('ShaderNodeNewGeometry')
facing = nodes.new('ShaderNodeVectorMath')
facing.operation = 'DOT_PRODUCT'
links.new(normal.outputs['Normal'], facing.inputs[0])
facing.inputs[1].default_value = (0, -1, 0)
weight = nodes.new('ShaderNodeMapRange')
weight.interpolation_type = 'SMOOTHSTEP'
weight.inputs['From Min'].default_value = .20
weight.inputs['From Max'].default_value = .72
links.new(facing.outputs['Value'], weight.inputs['Value'])
masked = nodes.new('ShaderNodeMath')
masked.operation = 'MULTIPLY'
links.new(weight.outputs['Result'], masked.inputs[0])
links.new(reference.outputs['Alpha'], masked.inputs[1])
mix = nodes.new('ShaderNodeMixRGB')
links.new(masked.outputs[0], mix.inputs[0])
links.new(vertex_color.outputs['Color'], mix.inputs[1])
links.new(reference.outputs['Color'], mix.inputs[2])

surface_color = mix.outputs['Color']
rear_image = folder / 'zonk-rear.projection.png'
if rear_image.exists():
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'Rear projection'
    image = nodes.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(str(rear_image))
    image.image.pack()
    image.extension = 'CLIP'
    links.new(uv.outputs['UV'], image.inputs['Vector'])
    rear_weight = nodes.new('ShaderNodeMapRange')
    rear_weight.interpolation_type = 'SMOOTHSTEP'
    rear_weight.inputs['From Min'].default_value = -.81
    rear_weight.inputs['From Max'].default_value = -.22
    rear_weight.inputs['To Min'].default_value = 1
    rear_weight.inputs['To Max'].default_value = 0
    links.new(facing.outputs['Value'], rear_weight.inputs['Value'])
    coverage = nodes.new('ShaderNodeMath')
    coverage.operation = 'MULTIPLY'
    links.new(rear_weight.outputs['Result'], coverage.inputs[0])
    links.new(image.outputs['Alpha'], coverage.inputs[1])
    rear_mix = nodes.new('ShaderNodeMixRGB')
    links.new(coverage.outputs[0], rear_mix.inputs[0])
    links.new(surface_color, rear_mix.inputs[1])
    links.new(image.outputs['Color'], rear_mix.inputs[2])
    surface_color = rear_mix.outputs['Color']

emission = nodes.new('ShaderNodeEmission')
links.new(surface_color, emission.inputs['Color'])
links.new(emission.outputs['Emission'], output.inputs['Surface'])
baked = nodes.new('ShaderNodeTexImage')
baked.image = bpy.data.images.new('ZONK · surface atlas', width=1536, height=1536, alpha=False)
nodes.active = baked
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
bpy.ops.object.bake(type='EMIT', margin=12)
texture_path = folder / 'zonk-surface.jpg'
baked.image.filepath_raw = str(texture_path)
baked.image.file_format = 'JPEG'
baked.image.save()
baked.image = bpy.data.images.load(str(texture_path), check_existing=False)
baked.image.pack()

links.new(baked.outputs['Color'], principled.inputs['Base Color'])
links.new(principled.outputs['BSDF'], output.inputs['Surface'])
principled.inputs['Roughness'].default_value = .29
principled.inputs['Coat Weight'].default_value = .51
principled.inputs['Coat Roughness'].default_value = .20
principled.inputs['Metallic'].default_value = .11
reference.image.pack()
shell['Source'] = 'Simplified TripoSR reconstruction with the front reference baked to its surface'
shell['Connector'] = 'Shared ZANG seat, width 0.316, depth 0.062'
if (folder / 'zonk-sticker.jpg').exists():
    fit_label(shell, folder / 'zonk-sticker.jpg', width=.197, height=.125, z=.023, radius=.009, bulge=.002)
frame_asset()
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'zonk.blend'))
bpy.ops.export_scene.gltf(filepath=str(folder / 'zonk.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_cameras=False, export_lights=False)
print(f'{original:,} source faces, {len(shell.data.polygons):,} exported triangles')
