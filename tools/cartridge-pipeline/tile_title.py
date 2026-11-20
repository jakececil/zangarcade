"""Fit physical pixel tiles directly into a reconstructed cartridge face."""
import random

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

GLYPHS = {
    'A': ('.#.', '#.#', '###', '#.#', '#.#'),
    'D': ('##.', '#.#', '#.#', '#.#', '##.'),
    'F': ('###', '#..', '##.', '#..', '#..'),
    'I': ('###', '.#.', '.#.', '.#.', '###'),
    'L': ('#..', '#..', '#..', '#..', '###'),
    'N': ('#..#', '##.#', '#.##', '#..#', '#..#'),
}


def fit_tile_title(shell, text, *, width, x, z):
    rows = ['.'.join(GLYPHS[letter][row] for letter in text) for row in range(5)]
    columns = len(rows[0])
    pitch = width / columns
    half = pitch * .468
    tree = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    vertices, faces, tile_materials = [], [], []
    rng = random.Random(613)
    for row, glyph_row in enumerate(rows):
        for column, pixel in enumerate(glyph_row):
            if pixel != '#':
                continue
            cx = x + (column+.5-columns/2)*pitch
            cz = z + (2-row)*pitch
            corners = [(cx-half, cz-half), (cx+half, cz-half), (cx+half, cz+half), (cx-half, cz+half)]
            surfaces = []
            for px, pz in corners:
                point, _, _, _ = tree.ray_cast(Vector((px, -1, pz)), Vector((0, 1, 0)), 2)
                if point is None:
                    raise ValueError('Tile title footprint crosses outside the reconstructed face')
                surfaces.append(point.y)
            start = len(vertices)
            thickness = rng.uniform(.0025, .0038)
            vertices.extend((px, y+depth, pz) for depth in (-thickness, .0015)
                            for (px, pz), y in zip(corners, surfaces))
            faces.extend(tuple(start+i for i in face) for face in (
                (0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
            ))
            tile_materials.extend([rng.choices(range(4), weights=(5, 4, 2, 1))[0]] * 6)

    mesh = bpy.data.meshes.new(text + ' title blocks')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    title = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(title)
    title.parent = shell
    bevel = title.modifiers.new('Rounded molded tile edges', 'BEVEL')
    bevel.width = .00065
    bevel.segments = 2
    for name, color, roughness in (
        ('Graded compactor yellow', (.92, .54, .080), .31),
        ('Reclaimed ochre enamel', (.95, .67, .142), .37),
        ('Worn ivory appliance enamel', (.91, .78, .40), .44),
        ('Warm recycled orange', (.77, .37, .066), .35),
    ):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = .15
        mesh.materials.append(material)
    for face, index in zip(mesh.polygons, tile_materials):
        face.material_index = index
    return title
