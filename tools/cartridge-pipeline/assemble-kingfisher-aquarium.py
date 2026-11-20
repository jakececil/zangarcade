"""Fit a hollow, glazed aquarium into the reconstructed Kingfisher cartridge."""
import argparse
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from blender_common import fit_label, frame_asset, import_reconstruction
from reference_bake import remove_projectors


# Traced inside the brass bezel in the 620 x 379 front projection. Fit every
# point against the recovered body so the cut leaves real material behind it.
APERTURE = (
    (143, 243), (212, 244), (302, 245), (400, 244), (479, 243), (517, 229),
    (540, 198), (552, 152), (544, 111), (521, 77), (490, 55),
    (438, 36), (373, 26), (311, 25), (253, 30), (206, 43),
    (165, 63), (132, 92), (111, 128), (103, 159), (109, 197), (124, 223),
)
BACK = -.021
FRAME_CENTER = Vector((.006, .056))


def solid_material(name, color, roughness, metallic=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return material


def mesh_object(name, verts, faces, material, *, parent=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    if material:
        mesh.materials.append(material)
    if smooth:
        for face in mesh.polygons:
            face.use_smooth = True
    return obj


def tree_of(obj):
    return BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())


def front_at(tree, x, z):
    return tree.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)), 2)[0]


def fitted_outline(shell):
    x_min = min(v.co.x for v in shell.data.vertices)
    x_max = max(v.co.x for v in shell.data.vertices)
    points = [Vector((x_min+(x_max-x_min)*x/620, -.143+.316*(1-z/379)))
              for x, z in APERTURE]
    tree = tree_of(shell)
    rim = []
    for i, (b, c) in enumerate(zip(points, points[1:]+points[:1])):
        a, d = points[i-1], points[(i+2) % len(points)]
        for step in range(5):
            t = step/5
            q = .5*((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t)
            for attempt in range(16):
                front = front_at(tree, *q)
                back = tree.ray_cast(Vector((q.x, 1, q.y)), Vector((0, -1, 0)), 2)[0]
                if front is not None and back is not None and back.y > BACK+.004:
                    rim.append((q.x, front.y-.0014, q.y))
                    break
                q = FRAME_CENTER.lerp(q, .975)
            else:
                raise ValueError('Aperture cannot be seated on the recovered shell')
    return rim


def cut_cavity(shell, rim, lining):
    count = len(rim)
    verts = [(x, y, z) for y in (-.159, BACK) for x, _, z in rim]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2*count)))]
    faces.extend((i, i+count, (i+1)%count+count, (i+1)%count) for i in range(count))
    cutter = mesh_object('Tank recess cutter', verts, faces, lining)
    bpy.ops.object.select_all(action='DESELECT')
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    cut = shell.modifiers.new('Hollow aquarium recess', 'BOOLEAN')
    cut.object = cutter
    cut.operation = 'DIFFERENCE'
    cut.solver = 'EXACT'
    cut.material_mode = 'TRANSFER'
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def fit_backing(shell, rim, path):
    material = solid_material('Underwater scenic backing', (.03, .16, .20), .77)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    paint = nodes.new('ShaderNodeTexImage')
    paint.image = bpy.data.images.load(str(path))
    paint.image.pack()
    shader = nodes.get('Principled BSDF')
    links.new(paint.outputs['Color'], shader.inputs['Base Color'])
    links.new(paint.outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = .19
    verts = [(x, BACK-.00055, z) for x, _, z in rim]
    backing = mesh_object('Aquarium habitat backing', verts, [tuple(range(len(verts)))],
                          material, parent=shell)
    lo_x, hi_x = min(p[0] for p in verts), max(p[0] for p in verts)
    lo_z, hi_z = min(p[2] for p in verts), max(p[2] for p in verts)
    uv = backing.data.uv_layers.new(name='Habitat projection')
    for loop in backing.data.loops:
        x, _, z = verts[loop.vertex_index]
        uv.data[loop.index].uv = ((x-lo_x)/(hi_x-lo_x), (z-lo_z)/(hi_z-lo_z))
    backing['cartridgeShadow'] = 'receive'


def fit_glazing(shell, rim):
    glass = solid_material('Clear aquarium bubble', (.99, .999, 1), .024)
    glass.use_backface_culling = True
    glass['cartridgeClearGlazing'] = True
    nodes, links = glass.node_tree.nodes, glass.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Transmission Weight'].default_value = .992
    shader.inputs['IOR'].default_value = 1.445
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    interface = nodes.new('ShaderNodeGroup')
    interface.node_tree = group
    interface.inputs['Thickness'].default_value = .0028
    absorption = nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (.91, .99, .99, 1)
    absorption.inputs['Density'].default_value = 1/.060
    links.new(absorption.outputs[0], nodes.get('Material Output').inputs['Volume'])

    verts = [(FRAME_CENTER.x, -.102, FRAME_CENTER.y)]
    faces = []
    edges, rings = len(rim), 22
    for band in range(1, rings+1):
        t = band/rings
        for x, y, z in rim:
            # The outer bend is part of the mesh. The fitted rim stays seated
            # in the old casting, even where the salvaged brass is irregular.
            px, pz = FRAME_CENTER.lerp(Vector((x, z)), t)
            depth = .062*(1-t*t)**.69
            rim_transition = t**9
            py = -.04 + (y+.04)*rim_transition - depth
            verts.append((px, py, pz))
    for i in range(edges):
        faces.append((0, 1+i, 1+(i+1)%edges))
    for band in range(rings-1):
        a, b = 1+band*edges, 1+(band+1)*edges
        for i in range(edges):
            j = (i+1)%edges
            faces.append((a+i, b+i, b+j, a+j))
    dome = mesh_object('Clear double-walled bubble glass', verts, faces, glass,
                       parent=shell, smooth=True)
    return dome


def fit_bezel(shell, rim):
    brass = solid_material('Weathered brass glazing rim', (.38, .172, .048), .34, .83)
    verts, faces, segments = [], [], 10
    for i, (x, y, z) in enumerate(rim):
        previous, following = Vector(rim[i-1]), Vector(rim[(i+1)%len(rim)])
        tangent = following-previous
        radial = Vector((tangent.z, 0, -tangent.x)).normalized()
        for j in range(segments):
            phi = math.tau*j/segments
            point = Vector((x, y-.0011, z)) + radial*.0032*math.cos(phi)
            point.y += .0019*math.sin(phi)
            verts.append(point)
    for i in range(len(rim)):
        a, b = i*segments, ((i+1)%len(rim))*segments
        for j in range(segments):
            k = (j+1)%segments
            faces.append((a+j, a+k, b+k, b+j))
    rim_obj = mesh_object('Brass glazing bead', verts, faces, brass, parent=shell, smooth=True)
    rim_obj['cartridgeShadow'] = 'cast'


def add_specimen(shell, glass_tree, folder, role, width, location, yaw, pitch):
    fish = import_reconstruction(folder / role / 'specimen.glb', native_gltf=True)
    fish.parent = shell
    fish['cartridgeShadow'] = 'both'
    fish.rotation_mode = 'XYZ'
    fish.rotation_euler = (0, pitch, yaw)
    for attempt in range(12):
        fish.scale = (width,)*3
        fish.location = location
        bpy.context.view_layer.update()
        points = [fish.matrix_world @ v.co for v in fish.data.vertices]
        # Keep each specimen inside the actual curved viewing envelope.
        fits = all((front := front_at(glass_tree, p.x, p.z)) is not None and
                   front.y+.0038 < p.y < BACK-.0014 for p in points)
        if fits:
            break
        width *= .946
    else:
        raise ValueError('Specimen does not fit the bubble: ' + role)
    for material in fish.data.materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get('Principled BSDF')
        color = shader.inputs['Base Color'].links[0].from_socket
        links.new(color, shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = .07
    print('Fitted', role, 'at width', round(width, 4), flush=True)


def populate_floor(shell, glass):
    kelp = [solid_material('Kelp olive', (.13, .29, .041), .58),
            solid_material('Kelp gold-green', (.24, .36, .053), .51),
            solid_material('Rust-red aquatic leaves', (.50, .16, .065), .53)]
    stones = [solid_material('Muted shell gravel', (.32, .215, .104), .61),
              solid_material('Pale golden pebbles', (.53, .39, .215), .59),
              solid_material('Deep slate gravel', (.105, .20, .199), .66)]
    rng = random.Random(550)
    blades = [(-.134, -.040, .055), (-.102, -.028, .044), (-.118, -.052, .035),
              (.132, -.029, .061), (.165, -.038, .055), (.111, -.027, .038)]
    for index, (x, y, height) in enumerate(blades):
        verts, faces = [], []
        sway = rng.uniform(-.022, .022)
        for segment in range(15):
            t = segment/14
            width = .0075*math.sin(math.pi*t)**.7 + .00035
            bend = sway*t + .009*math.sin(2*math.pi*t)
            for j in (-1, 0, 1):
                verts.append((x+bend+j*width, y-.009*math.sin(math.pi*t)+abs(j)*.003,
                              -.024+height*t+j*.0025*math.sin(math.pi*t)))
            if segment < 14:
                s = 3*segment
                faces.extend(((s, s+1, s+4, s+3), (s+1, s+2, s+5, s+4)))
        fitted = []
        for x, y, z in verts:
            front = front_at(glass, x, z)
            if front is None:
                break
            fitted.append((x, min(BACK-.001, max(y, front.y+.004)), z))
        if len(fitted) != len(verts):
            continue
        leaf = mesh_object('Curled kelp blade', fitted, faces, kelp[index%len(kelp)],
                           parent=shell, smooth=True)
        leaf['cartridgeShadow'] = 'both'
    gravel = []
    for _ in range(57):
        x, y = rng.uniform(-.130, .151), rng.uniform(-.061, -.025)
        size = rng.uniform(.0028, .0080)
        z = -.026+rng.uniform(0, .006)
        front = front_at(glass, x, z)
        if front is None or BACK-front.y < 2*size+.005:
            continue
        y = min(BACK-size-.001, max(y, front.y+size+.004))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size,
                                              location=(x, y, z))
        stone = bpy.context.object
        stone.name = 'Aquarium gravel'
        stone.scale = (rng.uniform(.9, 1.6), rng.uniform(.78, 1.12), rng.uniform(.49, .81))
        stone.rotation_euler.z = rng.uniform(0, math.tau)
        stone.parent = shell
        stone.data.materials.append(rng.choice(stones))
        gravel.append(stone)
        for face in stone.data.polygons:
            face.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    for stone in gravel:
        stone.select_set(True)
    bpy.context.view_layer.objects.active = gravel[0]
    bpy.ops.object.join()
    bpy.context.object.name = 'Aquarium gravel bed'
    bpy.context.object['cartridgeShadow'] = 'receive'


parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
folder = args.folder.resolve()
shell = next(obj for obj in bpy.data.objects if obj.name == 'kingfisher · reconstructed shell')
for child in list(shell.children):
    if child.name == 'Replaceable printed laminate':
        bpy.data.objects.remove(child, do_unlink=True)

rim = fitted_outline(shell)
cut_cavity(shell, rim, solid_material('Deep blue tank lining', (.039, .14, .165), .50))
fit_backing(shell, rim, folder / 'habitat.jpg')
dome = fit_glazing(shell, rim)
fit_bezel(shell, rim)
glass_tree = tree_of(dome)
add_specimen(shell, glass_tree, folder, 'lure-fish', .151, (-.074, -.058, .056), .17, -.10)
add_specimen(shell, glass_tree, folder, 'axolotl-fish', .147, (.085, -.053, .025), math.pi-.13, -.052)
add_specimen(shell, glass_tree, folder, 'moth-fish', .105, (.064, -.044, .115), .12, .124)
populate_floor(shell, glass_tree)
fit_label(shell, folder / 'label.jpg', width=.207, height=.050,
          z=-.067, radius=.006, bulge=.0009)
shell['opticalDisplay'] = True
shell['Aquarium'] = 'Curved glass, separate fish and dimensional habitat. Electronics occupy the base.'
frame_asset(.88)
thickness = dome.modifiers.new('Glazing wall for Cycles', 'SOLIDIFY')
thickness.thickness = .0028
thickness.offset = -1
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'kingfisher.blend'))
# The WebGL render uses the outer surface and glTF's explicit optical thickness.
dome.modifiers.remove(thickness)
remove_projectors(shell.data)
bpy.ops.export_scene.gltf(filepath=str(folder / 'kingfisher.glb'), export_format='GLB',
                         export_yup=True, export_apply=True, export_extras=True,
                         export_vertex_color='NONE', export_cameras=False, export_lights=False)
