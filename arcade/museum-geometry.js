import * as THREE from './vendor/three.module.js';
import { buildDistrict } from './district-architecture.js?v=4f0198d782a4';

export function museumGeometry({ games, box, plane, material, texture, paper, geometry, requestRender }) {
  const hall = new THREE.Group();
  const installation = new THREE.Group();
  const metal = material('#171c21', { metalness: .62, roughness: .48 });
  const brass = material('#9c7550', { metalness: .57, roughness: .52 });
  const lamp = material('#ffcb84', { emissive: '#ffb358', emissiveIntensity: .65 });
  const black = material('#080d12');
  const light = material('#6bdacf', { emissive: '#277e88', emissiveIntensity: .6 });

  const plaque = document.createElement('canvas');
  plaque.width = 768;
  plaque.height = 160;
  const signMaterials = [];

  function sign(title, prefix, accent, parent, x, y, z, yaw = 0, width = 2.24) {
    const sheet = plaque.cloneNode();
    const context = sheet.getContext('2d');
    context.fillStyle = '#10161c';
    context.fillRect(0, 0, 768, 160);
    context.fillStyle = accent;
    context.fillRect(0, 0, 13, 160);
    context.font = '600 30px monospace';
    context.fillText(prefix, 36, 54);
    context.fillStyle = '#f5ead8';
    context.font = '750 49px system-ui';
    context.fillText(title, 36, 121, 697);
    const map = new THREE.CanvasTexture(sheet);
    map.colorSpace = THREE.SRGBColorSpace;
    const surface = material('#ffffff', { map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: .42 });
    signMaterials.push(surface);
    const panel = plane(width, width * 160 / 768, surface, parent, x, y, z);
    panel.rotation.y = yaw;
    return panel;
  }

  const district = buildDistrict({ world:hall, games, sign, box, plane, material, texture, paper, geometry });
  sign('Back to ZANG', 'NEIGHBORHOOD EXIT', '#e8f8a4', installation, 0, 2.63, 3.69, Math.PI, 2.5);
  box(1.98, 2.41, .11, black, installation, 0, 1.22, 3.73);
  for (const x of [-1.015, 1.015]) box(.073, 2.35, .06, light, installation, x, 1.2, 3.653);
  box(1.95, .065, .04, light, installation, 0, .054, 3.64);

  const vistaSurface = material('#ffffff', { emissive: '#ffffff', emissiveIntensity: .26 });
  const coverSurface = paper();
  box(5.99, 2.42, .14, metal, installation, 0, 1.86, -3.682);
  const vista = plane(5.64, 2.12, vistaSurface, installation, 0, 1.86, -3.59);
  const cover = plane(.99, 1.38, coverSurface, installation, -2.58, 1.98, -1.86);
  cover.rotation.y = Math.PI / 2;
  const roomSign = sign('', '', '#dbefa7', installation, 0, 2.94, -3.54, 0, 2.75);
  const backdropTextures = new Map();
  const coverTextures = new Map();
  const ribs = new THREE.Group();
  const observation = new THREE.Group();
  installation.add(ribs, observation);
  const fishGroup = new THREE.Group();
  observation.add(fishGroup);
  const fish = [];
  const bodyGeometry = new THREE.SphereGeometry(1, 18, 12);
  const finGeometry = new THREE.ConeGeometry(1, 1, 3);
  const eyeGeometry = new THREE.SphereGeometry(1, 10, 8);
  const eye = material('#d8efe0', { emissive: '#5ea8a2', emissiveIntensity: .3 });
  const pigments = ['#61a6b1', '#e4a664', '#d993ac', '#97c4a1', '#8799d0'];
  const fishColors = pigments.map(color => material(color, { roughness: .29, metalness: .37, emissive: color, emissiveIntensity: .16 }));
  for (let index = 0; index < 10; index++) {
    const specimen = new THREE.Group();
    fishGroup.add(specimen);
    specimen.visible = false;
    const skin = fishColors[index % fishColors.length];
    const body = new THREE.Mesh(bodyGeometry, skin);
    body.scale.set(.24 + index % 3 * .037, .085 + index % 4 * .014, .054);
    specimen.add(body);
    const tail = new THREE.Mesh(finGeometry, skin);
    tail.rotation.z = -Math.PI / 2;
    tail.position.x = -.29 - index % 3 * .031;
    tail.scale.set(.14, .21, .032);
    specimen.add(tail);
    const dorsal = new THREE.Mesh(finGeometry, skin);
    dorsal.position.set(-.05, .09 + index % 4 * .014, 0);
    dorsal.scale.set(.086, .16, .022);
    dorsal.rotation.z = -.34;
    specimen.add(dorsal);
    for (const side of [-1, 1]) {
      const eyeball = new THREE.Mesh(eyeGeometry, eye);
      eyeball.position.set(.145 + index % 3 * .02, .023, side * .05);
      eyeball.scale.setScalar(.023);
      specimen.add(eyeball);
      const pupil = new THREE.Mesh(eyeGeometry, black);
      pupil.scale.setScalar(.013);
      pupil.position.copy(eyeball.position);
      pupil.position.z += side * .02;
      specimen.add(pupil);
    }
    fish.push({ specimen, tail });
  }
  const glass = material('#77d8d7', { transparent: true, opacity: .13, depthWrite: false, roughness: .29, metalness: .43 });
  plane(5.64, 2.12, glass, observation, 0, 1.86, -3.22);
  for (const x of [-2.87, -1.44, 1.44, 2.87]) {
    box(.115, 2.3, .25, brass, observation, x, 1.86, -3.24);
  }
  box(5.7, .11, .30, brass, observation, 0, .76, -3.28);
  box(5.7, .1, .30, brass, observation, 0, 2.97, -3.28);
  box(5.85, .018, .125, light, observation, 0, .69, -3.18);
  for (const x of [-2.77, 2.77]) for (const z of [-2.7, -.1, 2.4]) {
    box(.29, 3.14, .38, metal, ribs, x, 1.56, z);
    box(.018, 1.63, .065, lamp, ribs, x * .946, 1.93, z);
  }

  function setExhibit(game) {
    const index = games.indexOf(game);
    const underwater = game.id === 'kingfisher';
    if (!backdropTextures.has(game.id)) {
      const path = underwater ? './art/kingfisher-window.webp' : '../' + game.backdrop;
      const backdrop = texture(path);
      backdrop.repeat.y = .72;
      backdrop.offset.y = .14;
      backdropTextures.set(game.id, backdrop);
    }
    if (!coverTextures.has(game.id)) coverTextures.set(game.id, texture('../' + game.cover));
    vistaSurface.map = vistaSurface.emissiveMap = backdropTextures.get(game.id);
    coverSurface.map = coverTextures.get(game.id);
    vistaSurface.needsUpdate = coverSurface.needsUpdate = true;
    const old = roomSign.material.map;
    const signCanvas = old.image;
    const context = signCanvas.getContext('2d');
    context.fillStyle = '#0f1920';
    context.fillRect(0, 0, 768, 160);
    context.fillStyle = game.shellColors?.top || '#d5e8be';
    context.font = '600 29px monospace';
    context.fillText(underwater ? 'FRESHWATER OBSERVATORY' : `ROOM ${String(index + 1).padStart(2, '0')}`, 35, 50);
    context.fillStyle = '#fff1dc';
    context.font = '750 50px system-ui';
    context.fillText(game.title, 35, 120, 694);
    old.needsUpdate = true;
    observation.visible = underwater;
    ribs.visible = !underwater && index % 3 !== 1;
    vista.scale.set(1, index % 3 === 2 && !underwater ? .78 : 1, 1);
    requestRender();
  }

  return {
    hall, installation, ...district, setExhibit,
    setFishCount(count) {
      fish.forEach(({ specimen }, index) => { specimen.visible = index < count; });
      requestRender();
    },
    updateFish(time) {
      if (!installation.visible || !observation.visible) return;
      fish.forEach(({ specimen, tail }, index) => {
        if (!specimen.visible) return;
        const phase = time * (.00037 + index % 3 * .00012) + index * 1.7;
        specimen.position.set(Math.sin(phase) * (1.44 + index % 3 * .4), 1.23 + index % 5 * .27 + Math.sin(phase * 1.43) * .12, -3.49 + index % 4 * .037);
        specimen.rotation.y = Math.cos(phase) < 0 ? Math.PI : 0;
        tail.rotation.y = Math.sin(time * .014 + index) * .39;
      });
    },
    dispose() {
      for (const surface of signMaterials) surface.map.dispose();
      for (const geometry of [bodyGeometry, finGeometry, eyeGeometry]) geometry.dispose();
    }
  };
}
