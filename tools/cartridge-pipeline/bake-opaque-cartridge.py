"""Fit and bake a multiview cartridge, with a separate printed label."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction, open_pcb_window, smoothstep
from reference_bake import bake_reference_atlas, create_projectors, remove_projectors

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('slug')
parser.add_argument('--shell-width', type=float, default=.501)
parser.add_argument('--shell-height', type=float, default=.321)
parser.add_argument('--shell-depth', type=float, default=.099)
parser.add_argument('--native-gltf', action='store_true', help='input mesh already uses glTF axes')
parser.add_argument('--yaw', type=float, default=0, help='input yaw adjustment in degrees')
finish = parser.add_mutually_exclusive_group()
finish.add_argument('--candy-graft-material', action='store_true', help='metal pins and localized roughness for candy graft shells')
finish.add_argument('--refractive-resin', action='store_true', help='cloudy cast shell with depth-dependent refraction')
finish.add_argument('--compacted-scrap', action='store_true', help='mixed enamel, bare steel, plastic, and plated contacts')
finish.add_argument('--artifact-material', choices=('gilt-enamel', 'creek-stone', 'aquarium-enamel',
                                                    'gummy-machine', 'rebound-equipment',
                                                    'molded-playset', 'tufted-course'),
                    help='surface finish for a reconstructed artifact')
parser.add_argument('--resin-haze', type=float, default=1, help='uniform haze strength from 0 to 1')
parser.add_argument('--pcb', type=Path, help='standalone fitted edge-card GLB')
parser.add_argument('--pcb-window-top', type=float, default=-.105, help='top of the contact opening in GLB coordinates')
title_style = parser.add_mutually_exclusive_group()
title_style.add_argument('--tile-title', choices=('LANDFILL',), help='fit solid title tiles into the face')
title_style.add_argument('--ink-title', action='store_true', help='fit the opaque lettering from alpha in label.png')
title_style.add_argument('--projected-title', action='store_true', help='retain title artwork from the baked reference')
parser.add_argument('--label-width', type=float)
parser.add_argument('--label-height', type=float)
parser.add_argument('--label-x', type=float, default=0)
parser.add_argument('--label-y', type=float, help='label center height in GLB coordinates')
parser.add_argument('--contact-seam', type=float, help='replace the reconstructed contacts below this GLB height')
parser.add_argument('--cartridge-shadows', action='store_true', help='enable self-shadowing on the shell')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.pcb and not args.refractive_resin:
    parser.error('--pcb requires --refractive-resin')
if not 0 <= args.resin_haze <= 1:
    parser.error('--resin-haze must be between 0 and 1')
if not args.projected_title and (args.label_width is None or args.label_y is None):
    parser.error('--label-width and --label-y are required for a separate title')
if not (args.tile_title or args.projected_title) and args.label_height is None:
    parser.error('--label-height is required for a printed label')
if args.contact_seam is not None and (args.refractive_resin or not -.130 < args.contact_seam < -.086):
    parser.error('--contact-seam is for opaque shells and must be between -.130 and -.086')
folder = args.folder.resolve()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
shell = import_reconstruction(folder / 'shell-dense.glb', native_gltf=args.native_gltf)
if args.yaw:
    shell.data.transform(Matrix.Rotation(math.radians(args.yaw), 4, 'Z'))
shell.name = args.slug + ' · reconstructed shell'
coords = [v.co.copy() for v in shell.data.vertices]
lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
span = hi - lo
center = (hi + lo) / 2
toe = [v.x for v in coords if lo.z < v.z < lo.z + .064*span.z]
seat_center = (min(toe) + max(toe)) / 2

create_projectors(shell.data, coords, lo, span)

# Preserve the shell's lean and asymmetry. The bottom of the recovered part
# defines the connector center. Only the lower strip is constrained to the slot.
for vertex, (x, y, z) in zip(shell.data.vertices, coords):
    fraction = (z-lo.z)/span.z
    x = (x-seat_center)*args.shell_width/span.x
    y = (y-center.y)*args.shell_depth/span.y
    z = -.143 + fraction*args.shell_height
    seat = 1-smoothstep(.17, .34, fraction)
    x += (min(.157, max(-.157, x))-x)*seat
    y += (min(.030, max(-.030, y))-y)*seat
    vertex.co = (x, y, z)
source_faces = len(shell.data.polygons)
decimate = shell.modifiers.new('Reduce generated triangles', 'DECIMATE')
decimate.ratio = min(.78, 135000/source_faces)
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in shell.data.polygons:
    face.use_smooth = True
board = None
if args.pcb:
    board = import_reconstruction(args.pcb.resolve(), native_gltf=True)
    open_pcb_window(shell, board, args.pcb_window_top)
    for image in bpy.data.images:
        if image.filepath and not image.packed_file:
            image.pack()
finish_name = 'Worn specimen carapace'
if args.refractive_resin:
    finish_name = 'Cast turquoise resin'
elif args.compacted_scrap:
    finish_name = 'Compacted enamel and salvage'
elif args.artifact_material:
    finish_name = {'gilt-enamel': 'Gilt brass and indigo enamel',
                   'creek-stone': 'River-worn stone, moss, and wet channel',
                   'aquarium-enamel': 'Vitreous aquarium enamel and brass',
                   'gummy-machine': 'Gummy polymer, mint plates, and rubber gasket',
                   'rebound-equipment': 'Pebbled ball leather, rubber rail, and impact nylon',
                   'molded-playset': 'Snap-fit molded playset',
                   'tufted-course': 'Putting turf, cork, and enamel'}[args.artifact_material]
material = bpy.data.materials.new(finish_name)
atlas = bake_reference_atlas(shell, material, folder,
                             size=1024 if args.refractive_resin else 1536, basename='shell-atlas',
                             face_priority=args.artifact_material == 'molded-playset')
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
output = nodes.get('Material Output')
bsdf.inputs['Roughness'].default_value = .29
bsdf.inputs['Coat Weight'].default_value = .20
bsdf.inputs['Coat Roughness'].default_value = .24
if args.candy_graft_material:
    from material_zones import candy_graft_material
    candy_graft_material(material, atlas, folder, args.shell_height)
if args.compacted_scrap:
    from material_zones import compacted_scrap_material
    compacted_scrap_material(material, atlas, folder, args.shell_height)
if args.artifact_material == 'molded-playset':
    from material_zones import molded_playset_parts
    molded_playset_parts(shell, material, atlas, args.shell_height)
elif args.artifact_material:
    from material_zones import artifact_material
    artifact_material(material, atlas, folder, args.shell_height, args.artifact_material)
if args.refractive_resin:
    from resin_material import refractive_resin
    absorption = refractive_resin(shell, material, atlas, folder, args.shell_height,
                                  board=board, haze=args.resin_haze)
    shell['opticalDisplay'] = True

label = None
if args.tile_title:
    from tile_title import fit_tile_title
    label = fit_tile_title(shell, args.tile_title, width=args.label_width, x=args.label_x, z=args.label_y)
    label['cartridgeShadow'] = 'cast'
    shell['cartridgeShadow'] = 'receive'
elif not args.projected_title:
    label = fit_label(shell, folder / ('label.png' if args.ink_title else 'label.jpg'),
                      width=args.label_width, height=args.label_height, z=args.label_y,
                      x=args.label_x, radius=.006, bulge=0 if args.ink_title else .0014, ink_only=args.ink_title)
if board and label:
    label['cartridgeShadow'] = 'cast'
    board['cartridgeShadow'] = 'receive'
if args.contact_seam is not None:
    from standard_contact_edge import fit_contact_edge
    fit_contact_edge(shell, args.contact_seam)
if args.cartridge_shadows:
    shell['cartridgeShadow'] = 'both'
    if label:
        label['cartridgeShadow'] = 'both'
if args.artifact_material == 'tufted-course':
    from cartridge_turf import plant_turf
    plant_turf(shell, atlas)
shell['Source'] = 'Hunyuan3D-2mv.' if args.native_gltf else 'TripoSR.'
shell['Surface'] = 'Orthographic reference projections baked to the reconstructed shell.'
frame_asset(.90)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / (args.slug + '.blend')))
# Projector UVs stay editable in the .blend. The runtime only needs the
# baked atlas, and it belongs on UV0 for WebGL compatibility.
remove_projectors(shell.data)
if args.refractive_resin:
    # Leave scattering in the editable Cycles shader. The glTF exporter
    # recognizes a direct absorption connection for KHR_materials_volume.
    links.new(absorption, output.inputs['Volume'])
bpy.ops.export_scene.gltf(filepath=str(folder / (args.slug + '.glb')), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='MATERIAL' if args.artifact_material == 'tufted-course' else 'NONE',
                         export_cameras=False, export_lights=False)
shell.data.calc_loop_triangles()
print(f'{source_faces:,} generated triangles; {len(shell.data.loop_triangles):,} shell triangles exported.')
