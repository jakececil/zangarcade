import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { Reflector } from './vendor/Reflector.js';
import { landfillLayout, landfillLevel, lanes, sortZ, waterLevel } from './landfill-layout.js?v=cb7e86a36875';

const cycle = 5.8;
const motionPhase = [0, 3.82, 1.91];
const waterShader = {
  ...Reflector.ReflectorShader,
  uniforms: {
    ...Reflector.ReflectorShader.uniforms,
    time: { value: 0 },
    sunset: { value: null }
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 reflectedUV;
    varying vec3 world;
    void main() {
      reflectedUV = textureMatrix * vec4(position, 1.0);
      world = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D sunset;
    uniform float time;
    varying vec4 reflectedUV;
    varying vec3 world;
    void main() {
      vec3 eye = normalize(cameraPosition - world);
      float a = world.z * 4.7 + world.x * .65 - time * 1.92 + .9 * cos(world.x * .76 - time * .3);
      float b = world.z * 8.2 - world.x * 1.73 + time * 2.13;
      float c = world.x * 3.4 + world.z * 2.6 - time * 1.72 + sin(world.z * .9);
      vec3 n = normalize(vec3(.045 * cos(c) + .016 * cos(b), 1.0, .089 * cos(a) + .042 * cos(b)));
      float fresnel = .22 + .55 * pow(1.0 - clamp(dot(eye, n), 0.0, 1.0), 2.15);
      vec2 region = reflectedUV.xy / reflectedUV.w;
      float distanceFade = 1.0 - smoothstep(9.0, 99.0, distance(cameraPosition, world));
      vec2 ripple = vec2(.009 * (sin(a) + .57 * sin(c)), .016 * (sin(a) + .67 * sin(b))) * distanceFade;
      vec3 sky = texture2D(tDiffuse, clamp(region + ripple, .002, .998)).rgb * vec3(.59, .65, .78);
      vec3 base = vec3(.008, .037, .060) * (.82 + .18 * sin(b - c));
      vec3 lightDir = normalize(vec3(-.081, .087, -1.0));
      float glint = pow(max(dot(reflect(-lightDir, n), eye), 0.0), 155.0) * .82;
      vec3 direction = -eye;
      float horizonU = .5 + direction.x / max(.001, -direction.z) * .507;
      float coverage = step(.01, -direction.z) * smoothstep(.015, .17, min(horizonU, 1.0 - horizonU));
      vec3 horizon = mix(vec3(.28, .196, .225), texture2D(sunset, vec2(clamp(horizonU, 0.0, 1.0), .038)).rgb, coverage);
      vec3 nearWater = mix(base, sky, fresnel) + vec3(1.0, .37, .092) * glint;
      gl_FragColor = vec4(mix(nearWater, horizon, smoothstep(51.0, 146.0, distance(cameraPosition, world))), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

function makeSky(map) {
  const surface = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { sunset: { value: map } },
    vertexShader: `
      varying vec3 world;
      void main() {
        world = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D sunset;
      varying vec3 world;
      void main() {
        vec3 d = normalize(world);
        float t = smoothstep(-.03, .67, d.y);
        vec3 dusk = mix(vec3(.28, .196, .225), vec3(.09, .151, .232), t);
        float south = max(.001, -d.z);
        vec2 uv = vec2(.5 + d.x / south * .507, .038 + d.y / south * 1.72);
        vec2 edge = min(uv, 1.0 - uv);
        float blend = step(.01, -d.z) * smoothstep(.015, .17, edge.x) * smoothstep(-.04, .016, uv.y)
          * (1.0 - smoothstep(.79, .985, uv.y));
        vec3 image = texture2D(sunset, clamp(uv, 0.0, 1.0)).rgb;
        gl_FragColor = vec4(mix(dusk, image, blend), 1.0);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(158, 36, 20), surface);
  mesh.renderOrder = -10;
  return mesh;
}

function paintSign(lines, width, height, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const { background = '#a63817', fg = '#fff2c7', border = '#f9a84f' } = options;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, width, height * .04);
  ctx.fillRect(0, height * .96, width, height * .04);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  lines.forEach(([text, size, pos]) => {
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.fillText(text, width * .5, height * pos, width * .91);
  });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function baleGeometry([width, height, depth], seed) {
  const dimensions = new THREE.Vector3(width, height, depth).multiplyScalar(.5);
  const radius = Math.min(width, height, depth) * .089;
  const inner = dimensions.clone().addScalar(-radius);
  const geometry = new THREE.BoxGeometry(width, height, depth, 5, 5, 5);
  const vertices = geometry.attributes.position;
  const point = new THREE.Vector3();
  const core = new THREE.Vector3();
  for (let i = 0; i < vertices.count; i++) {
    point.fromBufferAttribute(vertices, i);
    core.copy(point).clamp(inner.clone().negate(), inner);
    const ripple = Math.sin(point.x * 25.9 + point.y * 11.2 + point.z * 14.3 + seed) * radius * .31;
    point.sub(core).normalize().multiplyScalar(radius + ripple).add(core);
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildLandfill({ material, texture, requestRender, touch }) {
  const group = new THREE.Group();
  const owned = [];
  const matrices = new Map();
  const temporaries = [];
  let clock = 0;
  let lastTime;
  let active = false;
  const scratch = new THREE.Object3D();
  const load = (file, repeat = 1) => texture(`./art/landfill/${file}.webp`, repeat);
  const worn = load('iron');
  const waste = load('bale');
  const grit = load('concrete');
  const oxide = load('oxide');
  const road = load('concrete', 7);
  const map = load('atlas-sky');
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const decal = (color, map, params = {}) =>
    material(color, { map, bumpMap: map, bumpScale: .044, ...params });
  const mats = {
    concrete: decal('#989098', road, { roughness: .86, bumpScale: .026 }),
    iron: decal('#8e9caf', worn, { metalness: .42, roughness: .49 }),
    rust: decal('#dd926f', oxide, { metalness: .42, roughness: .59 }),
    stripe: material('#e5ae48', { roughness: .79, bumpMap: grit, bumpScale: .011 }),
    wire: material('#5f6059', { metalness: .88, roughness: .35 }),
    hot: material('#2e2023', { emissive: '#ef4411', emissiveIntensity: .37, roughness: .63 }),
    lamp: material('#fbd8a1', { emissive: '#ff9c39', emissiveIntensity: 1.2 }),
    truck: decal('#39999a', worn, { metalness: .4, roughness: .35, bumpScale: .021 }),
    tire: decal('#39353a', worn, { roughness: .93, bumpScale: .016 }),
    counter: decal('#8e8e86', worn, { metalness: .63, roughness: .41, bumpScale: .03 }),
    hatch: material('#22202b', { metalness: .21, roughness: .47, emissive: '#5b290d', emissiveIntensity: .36 })
  };
  mats.concrete.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 slabPoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nslabPoint = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 slabPoint;')
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        float tide = sin(slabPoint.x * 1.6 + cos(slabPoint.z * 1.31)) * .53;
        tide += sin(slabPoint.z * 2.73 + slabPoint.x * .86) * .23;
        tide += sin((slabPoint.x - slabPoint.z) * 7.31) * .05;
        float wet = smoothstep(.19, .48, tide);
        diffuseColor.rgb *= mix(1.0, .60, wet);
        roughnessFactor = mix(roughnessFactor, .26, wet);`);
  };
  ['#9fc0a8', '#c1a696', '#a4a4bc', '#c8a879'].forEach((color, i) => {
    mats['bale' + i] = decal(color, waste, { roughness: .55, metalness: .12, bumpScale: .054 });
  });
  ['#625650', '#524c66', '#546665'].forEach((color, i) => {
    mats['rubble' + i] = decal(color, load('bale', 4), { roughness: .91, bumpScale: .13 });
  });
  const lampRim = material('#171e22', { metalness: .65, roughness: .43 });
  const signalMats = ['#ef491a', '#ffba36', '#84dedd'].map(color =>
    material(color, { emissive: color, emissiveIntensity: 1.4, metalness: .2, roughness: .42 }));

  function box(w, h, d, surface, x, y, z, parent = group) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function sign(lines, opts, w, h, x, y, z, yaw = 0) {
    const texture = paintSign(lines, 1024, opts.height, opts);
    const surface = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(w, h);
    owned.push(texture, surface, geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    group.add(mesh);
  }

  landfillLayout(part => {
    const surface = mats[part.surface];
    if (!matrices.has(surface)) matrices.set(surface, []);
    const geometry = part.surface.startsWith('bale') ? baleGeometry(part.size, part.x + part.z)
      : part.shape === 'box' ? new THREE.BoxGeometry(...part.size) : new THREE.CylinderGeometry(...part.size);
    scratch.position.set(part.x, part.y, part.z);
    scratch.rotation.set(part.rx, part.ry, part.rz);
    scratch.updateMatrix();
    geometry.applyMatrix4(scratch.matrix);
    matrices.get(surface).push(geometry);
    temporaries.push(geometry);
  });
  for (const [surface, shapes] of matrices) {
    const geometry = mergeGeometries(shapes);
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.castShadow = surface !== mats.lamp && surface !== mats.hot;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const geometry of temporaries) geometry.dispose();

  sign([['TRASHLAND', 161, .48], ['COASTAL SORTING WORKS', 36, .80]], {
    height: 245, background: '#9e401e', border: '#ffae62'
  }, 4.03, .71, 0, 3.23, 10.162);
  sign([['CROSS ON BLUE', 78, .34], ['AMBER WARNS   /   RED BURNS', 32, .75]], {
    height: 155, background: '#252f32', border: '#ffd16d'
  }, 2.68, .44, 0, 2.75, 10.19);
  sign([['THE LAST BITE', 138, .43], ['HOT FOOD · END OF THE LINE', 37, .81]], {
    height: 215, background: '#392525', border: '#ffaf58'
  }, 3.01, .48, 8.47, 1.73, -11.58);
  sign([['BACK TO ZANG', 128, .5]], {
    height: 185, background: '#3f3130'
  }, 1.79, .30, 0, 2.13, 20.793, Math.PI);
  for (let i = 0; i < 8; i++) {
    const x = 7.3 + i * .21;
    const height = .13 + i % 3 * .055;
    box(.085, height, .088, i % 2 ? mats.rust : mats.stripe, x, -.20 + height / 2, -11.76);
    box(.045, .048, .052, mats.counter, x, -.18 + height, -11.76);
  }
  box(1.67, .085, .24, mats.counter, 8.035, -.236, -11.74);
  const menu = {
    height: 500, background: '#193033', fg: '#ffdc9b', border: '#ef9f57'
  };
  sign([['TODAY', 145, .23], ['BALE FRIES', 89, .50], ['SOFT WRECK', 73, .73]], menu, .61, .41, 9.64, .22, -11.934);
  for (const x of [7.0, 9.9]) box(.056, 1.14, .07, mats.iron, x, .38, -11.49);
  const vendorCoat = material('#a56e42', { roughness: .93, map: oxide });
  const vendorSkin = material('#7d927e', { roughness: .85 });
  const cook = new THREE.Group();
  cook.position.set(8.55, -.04, -11.87);
  group.add(cook);
  function oval(w, h, d, surface, x, y, z) {
    const geometry = new THREE.SphereGeometry(1, 16, 10);
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    cook.add(mesh);
    return mesh;
  }
  oval(.26, .34, .17, vendorCoat, 0, .11, 0);
  oval(.128, .17, .112, vendorSkin, 0, .45, .05);
  oval(.167, .070, .134, mats.iron, 0, .547, .048);
  oval(.154, .016, .127, mats.iron, .012, .514, .105);
  oval(.051, .026, .018, mats.lamp, 0, .472, .156);
  oval(.090, .063, .076, vendorSkin, -.23, -.105, .16);
  oval(.086, .060, .074, vendorSkin, .22, -.115, .16);
  for (let z = 17.6; z > -16.4; z -= 3.7) {
    if (z > -12.9 && z < -5) continue;
    const seam = box(23.2, .008, .035, mats.iron, 0, landfillLevel(z) + .006, z);
    seam.receiveShadow = true;
  }
  for (const x of [-5.14, 5.14]) {
    for (let i = 0; i < 5; i++) {
      const z = 1.6 + i * 1.87;
      box(.08, .72, 1.48, i % 2 ? mats.rust : mats.stripe, x, .48, z);
      box(.086, .045, 1.29, mats.lamp, x * .989, .137, z);
      for (const dz of [-.65, .65]) box(.092, .062, .066, mats.iron, x * .986, .73, z + dz);
    }
  }
  for (let i = 0; i < 7; i++) {
    box(.042, .04, 1.21, mats.counter, 5.13, -.38 + i * .065, -12.68);
  }
  box(.055, .13, .42, mats.rust, 5.11, -.53, -12.68);
  box(.098, .15, .11, mats.lamp, 7.3, 1.22, -11.69);

  const sky = makeSky(map);
  owned.push(sky.geometry, sky.material);
  group.add(sky);
  const waterGeometry = new THREE.PlaneGeometry(410, 312);
  const water = new Reflector(waterGeometry, {
    textureWidth: touch ? 384 : 672, textureHeight: touch ? 240 : 420,
    multisample: 0, clipBias: .001, shader: waterShader
  });
  water.position.set(0, waterLevel, -152);
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.sunset.value = map;
  owned.push(waterGeometry, water);
  group.add(water);

  const sun = new THREE.DirectionalLight('#ffb36d', 3.08);
  sun.position.set(-5, 11, -36);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(touch ? 1024 : 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.top = 13;
  sun.shadow.camera.far = 64;
  sun.shadow.normalBias = .038;
  sun.shadow.bias = -.00012;
  group.add(sun, sun.target, new THREE.HemisphereLight('#a8caff', '#c28a7f', 1.95));
  const bounce = new THREE.DirectionalLight('#a3c7ff', .79);
  bounce.position.set(6, 5, 20);
  group.add(bounce);
  owned.push(sun.shadow);
  const kioskLight = new THREE.PointLight('#ffc970', 17, 8, 2);
  kioskLight.position.set(7.8, 1, -10.87);
  group.add(kioskLight);
  const pedLight = new THREE.PointLight('#c1f5e1', 7, 4.3, 2);
  pedLight.position.set(2.5, .64, -11.8);
  group.add(pedLight);

  const sparkColors = [new THREE.Color('#fff1ac'), new THREE.Color('#ffac39'), new THREE.Color('#ff5e21')];
  const sparkGeometry = new THREE.IcosahedronGeometry(1, 0);
  const sparkMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  owned.push(sparkGeometry, sparkMaterial);
  const flareCanvas = document.createElement('canvas');
  flareCanvas.width = flareCanvas.height = 64;
  const flareContext = flareCanvas.getContext('2d');
  const flameGradient = flareContext.createRadialGradient(32, 34, 1, 32, 32, 32);
  flameGradient.addColorStop(0, '#fff0bc');
  flameGradient.addColorStop(.20, '#ff9a2cab');
  flameGradient.addColorStop(.65, '#f94b1142');
  flameGradient.addColorStop(1, '#e5260000');
  flareContext.fillStyle = flameGradient;
  flareContext.fillRect(0, 0, 64, 64);
  const flareMap = new THREE.CanvasTexture(flareCanvas);
  flareMap.colorSpace = THREE.SRGBColorSpace;
  owned.push(flareMap);
  const chutes = lanes.map((x, i) => {
    const bale = new THREE.Group();
    const body = new THREE.Mesh(baleGeometry([1.62, 1.24, 1.58], i), mats['bale' + i]);
    owned.push(body.geometry);
    bale.add(body);
    body.castShadow = true;
    body.receiveShadow = true;
    for (const shift of [-.43, .43]) box(.057, 1.26, 1.62, mats.wire, shift, 0, 0, bale);
    group.add(bale);
    box(.31, .91, .19, lampRim, x, 2.50, 7.25);
    const lamps = signalMats.map((mat, channel) =>
      box(.18, .17, .045, mat, x, 2.77 - channel * .25, 7.36));
    const laneMarkers = [3.17, 6.13].map(z => box(2.32, .034, .092, signalMats[2], x, .039, z));
    const glow = new THREE.PointLight('#fc4a12', 0, 5.6, 2);
    glow.position.set(x, .27, sortZ);
    group.add(glow);
    const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, 30);
    for (let j = 0; j < sparks.count; j++) sparks.setColorAt(j, sparkColors[j % sparkColors.length]);
    sparks.frustumCulled = false;
    group.add(sparks);
    const flareMaterial = new THREE.SpriteMaterial({ map: flareMap, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    owned.push(flareMaterial);
    const flare = new THREE.Sprite(flareMaterial);
    flare.position.set(x, .28, sortZ);
    group.add(flare);
    return { x, bale, glow, sparks, flare, lamps, laneMarkers, signal: 'blue' };
  });

  const reflectScene = water.onBeforeRender;
  water.onBeforeRender = function(render, scene, camera, ...args) {
    // A walk-through can see the sunset and the pier reflected in the same pass.
    // Disable that second scene draw while the handheld is the focus.
    if (active && !resting) {
      reflectScene.call(this, render, scene, camera, ...args);
    }
  };
  let resting = false;
  function tick(time, pause, reduced) {
    if (lastTime !== undefined && !pause) clock += Math.min(.05, (time - lastTime) * .001);
    lastTime = time;
    resting = pause;
    water.material.uniforms.time.value = reduced ? 0 : clock;
    for (const [i, chute] of chutes.entries()) {
      const phase = (clock + motionPhase[i]) % cycle;
      const fire = phase >= 1.83 && phase < 2.65;
      const red = phase >= 1.14 && phase < 2.65;
      const amber = phase < 1.14 || (phase >= 2.65 && phase < 2.95);
      const light = red ? 0 : amber ? 1 : 2;
      chute.signal = ['red', 'amber', 'blue'][light];
      chute.lamps.forEach((lamp, channel) => { lamp.visible = channel === light; });
      for (const marker of chute.laneMarkers) marker.material = signalMats[light];
      const fall = THREE.MathUtils.clamp((phase - 1.14) / .70, 0, 1);
      const burn = Math.max(0, 1 - (phase - 1.84) * 1.66);
      chute.bale.visible = phase < 1.84 || (fire && burn > .05);
      chute.bale.position.set(chute.x, 6.74 - fall * fall * 6.17, sortZ);
      chute.bale.rotation.set(fall * .12, .22 + fall * .41, -fall * .19);
      chute.bale.scale.setScalar(phase < 1.84 ? 1 : burn);
      chute.glow.intensity = fire ? 19 * burn : 0;
      chute.flare.visible = fire && !reduced;
      chute.flare.material.opacity = fire ? Math.max(0, burn) * .91 : 0;
      chute.flare.scale.set(2.3 + Math.max(0, 1 - burn) * 1.1, 1.45, 1);
      chute.sparks.visible = fire && !reduced;
      if (chute.sparks.visible) {
        const age = (phase - 1.83) * 1.25;
        for (let j = 0; j < chute.sparks.count; j++) {
          const direction = j * 2.39996;
          const spread = (.42 + (j % 7) * .14) * age;
          scratch.position.set(chute.x + Math.cos(direction) * spread,
            .06 + Math.max(0, Math.sin(Math.PI * age) * (.32 + (j % 13) * .13)), sortZ + Math.sin(direction) * spread);
          scratch.rotation.set(j, j + age, j * .3);
          scratch.scale.setScalar((.024 + (j % 7) * .012) * (1 - age));
          scratch.updateMatrix();
          chute.sparks.setMatrixAt(j, scratch.matrix);
        }
        chute.sparks.instanceMatrix.needsUpdate = true;
      }
    }
  }

  return {
    group,
    tick,
    setActive(value) {
      group.visible = active = value;
      lastTime = undefined;
      if (value) requestRender();
    },
    hit(x, z) {
      return Math.abs(z - sortZ) < 1.41 && this.signal(x) === 'red';
    },
    signal(x) {
      return chutes.reduce((nearest, chute) => Math.abs(x - chute.x) < Math.abs(x - nearest.x) ? chute : nearest).signal;
    },
    dispose() {
      group.removeFromParent();
      for (const item of owned) item.dispose();
      for (const { sparks } of chutes) sparks.dispose();
    }
  };
}
