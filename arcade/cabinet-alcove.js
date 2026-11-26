import * as THREE from './vendor/three.module.js';
import { loadCartridgeAsset } from './cartridge-assets.js';

export const cabinetAsset = './arcade/art/gutter-cabinet.glb?v=534c1952c176';

export async function mountCabinet(placeholders, requestRender) {
  const model = await loadCartridgeAsset(cabinetAsset);
  for (const placeholder of placeholders) {
    placeholder.clear();
    placeholder.add(model.clone(true));
  }
  requestRender();
}

export function buildCabinetAlcove({ parent, texture, material, geometry, box, cylinder }) {
  const alcove = new THREE.Group();
  alcove.position.set(2.963, 0, -2.07);
  alcove.rotation.y = -Math.PI / 2;
  parent.add(alcove);

  const cast = texture('./art/cast-charcoal.webp?v=f9ec788c4039');
  const panelSurface = material('#c1b9a2', { map: cast, bumpMap: cast, bumpScale: .027, roughness: .86, metalness: .1 });
  const trim = material('#393530', { map: cast, roughness: .57, metalness: .46 });
  const footing = material('#958b79', { map: cast, bumpMap: cast, bumpScale: .013, roughness: .92 });
  const bronze = material('#9a7942', { roughness: .51, metalness: .55 });
  const lens = material('#ffc883', { emissive: '#ffb25e', emissiveIntensity: 1.85 });

  // One warped casting can be flipped and reused. The recessed channels
  // and flared outer edges belong to the mesh, with grain supplied by UVs.
  const panel = new THREE.PlaneGeometry(.98, 2.62, 30, 46);
  geometry.add(panel);
  const points = panel.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const rib = Math.exp(-((x+.24+.08*Math.sin(2.8*y))**2)/.010)
      + .64*Math.exp(-((x-.23-.05*Math.cos(4*y))**2)/.008);
    const bulge = .065*Math.exp(-((y+.96)**2)/.20);
    const twist = .020*Math.sin(10*x+3*y)*Math.cos(4.3*y)
      + .006*Math.cos(22*x-18*y);
    points.setXYZ(i, x*(.96+.055*Math.sin(4.5*y)), y + .034*Math.sin(3*x+4*y), .03 + .088*rib + twist + bulge);
  }
  panel.computeVertexNormals();
  for (const side of [-1,1]) {
    const piece = new THREE.Mesh(panel, panelSurface);
    piece.position.set(side*.49, 1.4, .029);
    piece.rotation.z = side < 0 ? Math.PI : 0;
    alcove.add(piece);
    for (const y of [.24,2.57]) {
      const stud = cylinder(.032,.048,bronze,alcove,side*.79,y,.128);
      stud.rotation.x = Math.PI/2;
    }
    const fixture = cylinder(.115,.12,trim,alcove,side*.55,2.58,.36);
    fixture.rotation.z = side*.18;
    cylinder(.083,.023,lens,alcove,side*.55,2.506,.36);
  }
  box(1.91,.07,.65,trim,alcove,0,2.66,.28);
  for (const x of [-.423,.423]) {
    for (const z of [.29,.81]) {
      box(.826,.027,.50,footing,alcove,x,.014,z);
    }
  }
  for (const x of [-.73,.73]) box(.029,.017,1.02,bronze,alcove,x,.033,.57);
  const light = new THREE.PointLight('#ffd5a0', 6.4, 4, 2);
  light.position.set(-.25,2.44,.92);
  alcove.add(light);
}
