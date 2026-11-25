"""Seat a molded, 32-contact edge card under a reconstructed shell."""

import bmesh
import bpy


def fit_contact_edge(shell, seam):
    edit = bmesh.new()
    edit.from_mesh(shell.data)
    bmesh.ops.bisect_plane(edit, geom=list(edit.verts)+list(edit.edges)+list(edit.faces),
                          dist=.00008, plane_co=(0,0,seam), plane_no=(0,0,1), clear_inner=True)
    border = [edge for edge in edit.edges if edge.is_boundary
              and all(abs(vertex.co.z-seam)<.0002 for vertex in edge.verts)]
    bmesh.ops.holes_fill(edit, edges=border, sides=0)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(shell.data)
    edit.free()

    def surface(name, color, metal, roughness):
        finish = bpy.data.materials.new(name)
        finish.use_nodes = True
        shader = finish.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color,1)
        shader.inputs['Metallic'].default_value = metal
        shader.inputs['Roughness'].default_value = roughness
        return finish

    shoulder = surface('Shock-absorbing key shoulder', (.039,.025,.037), .04, .49)
    pcb = surface('Unplated burgundy edge laminate', (.10,.038,.047), .04, .53)
    gold = surface('Hard gold edge plating', (.76,.49,.17), .96, .24)

    def block(name, position, size, finish, radius):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        body = bpy.context.object
        body.name = name
        for vertex in body.data.vertices:
            for axis, scale in enumerate(size):
                vertex.co[axis] *= scale
        body.data.materials.append(finish)
        bevel = body.modifiers.new('Molded radius', 'BEVEL')
        bevel.width = radius
        bevel.segments = 2
        body.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
        return body

    top = seam + .003
    toe = -.143
    block('Keyed seat shoulder', (0,.001,top-.006), (.310,.060,.012), shoulder, .0026)
    block('Insulated connector back', (0,.008,(toe+top)/2), (.296,.039,top-toe), shoulder, .0023)
    block('Recessed contact board', (0,-.015,(toe+top)/2), (.277,.010,top-toe), pcb, .0012)
    for x,width in [(-.143,.012),(.142,.016)]:
        block('Guide rail', (x,-.017,(toe+top)/2), (width,.019,top-toe), shoulder, .0014)
    fingers=[]
    for i in range(32):
        bottom = toe+.001+(0 if i%8 else .0011)
        end = top-.009
        fingers.append(block('Plated finger',((i-15.5)*.0083,-.0206,(bottom+end)/2),
                             (.0057,.0015,end-bottom),gold,.00043))
    bpy.ops.object.select_all(action='DESELECT')
    for finger in fingers:
        finger.select_set(True)
    bpy.context.view_layer.objects.active = fingers[0]
    bpy.ops.object.join()
    bpy.context.object.name = '32 plated front contacts'
