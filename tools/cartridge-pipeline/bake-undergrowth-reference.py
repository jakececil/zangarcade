"""Use the TripoSR surface directly and transfer the approved shell reference."""
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction, smoothstep

pcb_source, folder = [Path(value).resolve() for value in sys.argv[sys.argv.index('--') + 1:]]
bpy.ops.wm.open_mainfile(filepath=str(pcb_source))
old_shell = next(obj for obj in bpy.context.scene.objects if obj.name.startswith('Undergrowth · variable-depth'))
for child in list(old_shell.children):
    bpy.data.objects.remove(child, do_unlink=True)
bpy.data.objects.remove(old_shell, do_unlink=True)

shell = import_reconstruction(folder / 'empty-shell.glb')
shell.name = 'Undergrowth · reference-baked TripoSR surface'
source_faces = len(shell.data.polygons)
low = Vector(tuple(min(v.co[i] for v in shell.data.vertices) for i in range(3)))
high = Vector(tuple(max(v.co[i] for v in shell.data.vertices) for i in range(3)))
size = high - low
center = (high + low) / 2
projection = shell.data.uv_layers.new(name='Reference projection')
for loop in shell.data.loops:
    v = shell.data.vertices[loop.vertex_index].co
    projection.data[loop.index].uv = ((v.x - low.x)/size.x, (v.z - low.z)/size.z)

# Register the whole casting to the PCB. This moves the recessed window in
# front of the chips without deforming the front relief. Constrain only the
# foot that can enter the existing arcade slot.
floor = -.094
for vertex in shell.data.vertices:
    x, y, z = vertex.co
    z = -.115 + (z-low.z)*.286/size.z
    y = (y-center.y)*.096/size.y - .0195
    x = (x-center.x)*.531/size.x
    seat = 1 - smoothstep(-.061, -.041, z)
    x += (min(.183, max(-.183, x))-x)*seat
    y += (min(.030, max(-.030, y))-y)*seat
    vertex.co = (x, y, z)

bm = bmesh.new()
bm.from_mesh(shell.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                     dist=1e-6, plane_co=(0, 0, floor), plane_no=(0, 0, 1), clear_inner=True)
foot = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z-floor)<2e-5 for v in e.verts)]
bmesh.ops.holes_fill(bm, edges=foot)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(shell.data)
bm.free()

simplify = shell.modifiers.new('Light simplification of the generated mesh', 'DECIMATE')
simplify.ratio = .73
bpy.ops.object.modifier_apply(modifier=simplify.name)
for face in shell.data.polygons:
    face.use_smooth = True
paint = shell.data.color_attributes.active_color or shell.data.color_attributes[0]
atlas = shell.data.uv_layers.new(name='Baked color atlas')
shell.data.uv_layers.active = atlas
atlas.active_render = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.12, island_margin=.008, correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')

material = bpy.data.materials.new('Reference-baked cast amber')
material.use_nodes = True
material.use_backface_culling = True
shell.data.materials.clear()
shell.data.materials.append(material)
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf, output = nodes.get('Principled BSDF'), nodes.get('Material Output')
reference = bpy.data.images.load(str(folder / 'empty-shell.projection.png'))
reference.pack()
uv = nodes.new('ShaderNodeUVMap')
uv.uv_map = 'Reference projection'


def image_node(image, projected=False):
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    if projected:
        node.extension = 'EXTEND'
        links.new(uv.outputs['UV'], node.inputs['Vector'])
    return node


original = image_node(reference, projected=True)
inferred = nodes.new('ShaderNodeVertexColor')
inferred.layer_name = paint.name
geometry = nodes.new('ShaderNodeNewGeometry')
facing = nodes.new('ShaderNodeVectorMath')
facing.operation = 'DOT_PRODUCT'
facing.inputs[1].default_value = (0, -1, 0)
links.new(geometry.outputs['Normal'], facing.inputs[0])
weight = nodes.new('ShaderNodeMapRange')
weight.interpolation_type = 'SMOOTHSTEP'
weight.inputs['From Min'].default_value = .03
weight.inputs['From Max'].default_value = .60
links.new(facing.outputs['Value'], weight.inputs['Value'])
mask = nodes.new('ShaderNodeMath')
mask.operation = 'MULTIPLY'
links.new(weight.outputs['Result'], mask.inputs[0])
links.new(original.outputs['Alpha'], mask.inputs[1])
mix = nodes.new('ShaderNodeMixRGB')
links.new(mask.outputs[0], mix.inputs[0])
links.new(inferred.outputs['Color'], mix.inputs[1])
links.new(original.outputs['Color'], mix.inputs[2])
emission = nodes.new('ShaderNodeEmission')
links.new(mix.outputs['Color'], emission.inputs['Color'])
links.new(emission.outputs[0], output.inputs['Surface'])
target = image_node(bpy.data.images.new('Reference surface atlas', width=1536, height=1536))
nodes.active = target
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
bpy.ops.object.bake(type='EMIT', margin=9)
target.image.filepath_raw = str(folder / 'undergrowth-reference-atlas.jpg')
target.image.file_format = 'JPEG'
target.image.save()
target.image = bpy.data.images.load(target.image.filepath_raw, check_existing=False)
target.image.pack()
links.new(target.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs[0], output.inputs['Surface'])
bsdf.inputs['Roughness'].default_value = .31
bsdf.inputs['Coat Weight'].default_value = .19
bsdf.inputs['Coat Roughness'].default_value = .25
bsdf.inputs['IOR'].default_value = 1.44

# Map the front reference's pale regions to a clear casting and keep the
# more saturated raised details dense. No shapes are painted into the mesh.
w, h = reference.size
colors = np.empty(w*h*4, dtype=np.float32)
reference.pixels.foreach_get(colors)
source = colors.reshape((h, w, 4))
step = max(1, round(w/640))
source = source[::step, ::step]
rgb = np.maximum(source[:, :, :3], 0)**(1/2.2)
chroma = (rgb.max(axis=2)-rgb.min(axis=2))/np.maximum(.001, rgb.max(axis=2))
density = np.clip((chroma-.40)/.37, 0, 1)
density = density*density*(3-2*density)
present = source[:, :, 3]
transmit = (.94-.90*density)*present
optical_depth = (.09+.77*density)*present


def map_image(name, pixels):
    height, width = pixels.shape
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels[:, :, None]
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(folder / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image_node(image, projected=True)


glass = map_image('reference-transmission', transmit)
links.new(glass.outputs['Color'], bsdf.inputs['Transmission Weight'])
finish = map_image('reference-roughness', .086 + .21*density)
links.new(finish.outputs['Color'], bsdf.inputs['Roughness'])
thick = map_image('reference-thickness', optical_depth)
scale = nodes.new('ShaderNodeMath')
scale.operation = 'MULTIPLY'
scale.inputs[1].default_value = .013
links.new(thick.outputs['Color'], scale.inputs[0])
volume_settings = nodes.new('ShaderNodeGroup')
volume_settings.node_tree = bpy.data.node_groups['glTF Material Output']
links.new(scale.outputs[0], volume_settings.inputs['Thickness'])
absorption = nodes.new('ShaderNodeVolumeAbsorption')
absorption.inputs['Color'].default_value = (1, .40, .08, 1)
absorption.inputs['Density'].default_value = 1/.024
links.new(absorption.outputs[0], output.inputs['Volume'])

label_path = folder / 'undergrowth-wordmark.jpg'
if label_path.is_file():
    plate = fit_label(shell, label_path, width=.175, height=.021, z=.028, radius=.002, bulge=.0005)
    # This reference has a subtle recessed pane. Keep the stiff nameplate
    # seated on its frame with a common depth rather than bending it into it.
    front = min(v.co.y for v in plate.data.vertices)-.00035
    for vertex in plate.data.vertices:
        vertex.co.y = front

shell['Source'] = 'TripoSR surface. Direct front reference UV bake, generated color on sides and rear.'
shell['Geometry edits'] = 'Fit at connector and decimation; no resculpting of visible features.'
frame_asset(.96)
bpy.ops.object.select_all(action='DESELECT')
shell.select_set(True)
bpy.context.view_layer.objects.active = shell
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'undergrowth-advance.blend'))

for name in ('Gold contact fingers', 'Copper routing', 'Black ceramic packages'):
    surface = bpy.data.materials[name]
    batch = [o for o in bpy.context.scene.objects if o.type in ('MESH','CURVE') and
             o.data.materials and o.data.materials[0] == surface]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = batch[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.context.object.name = name
bpy.ops.export_scene.gltf(filepath=str(folder / 'undergrowth-advance.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True, export_vertex_color='NONE',
                         export_cameras=False, export_lights=False)
shell.data.calc_loop_triangles()
print(f'{source_faces:,} generated triangles; {len(shell.data.loop_triangles):,} after fit and decimation.')
