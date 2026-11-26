import * as THREE from './vendor/three.module.js';
import { districtDoors, districts, levelAt, wallSections } from './district-layout.js?v=c354d2963689';
const palette = {
  landing: ['#817067','#534c4e','#ffc68f'],
  market: ['#8b8b80','#515b61','#ffe0ad'],
  ramp: ['#747567','#626067','#d0aa7c'],
  outside: ['#baa18a','#8d766a','#f9d2a1'],
  gut: ['#805e54','#67404f','#e49a88']
};

export function buildDistrict({ world, games, sign, box, plane, material, texture, paper, geometry }) {
  const doors = districtDoors(games);
  const cast = texture('./art/cast-charcoal.webp?v=f9ec788c4039',2);
  const enamel = texture('./art/guts-enamel.webp',2);
  const trim = material('#48484c', { map:cast, metalness:.43, roughness:.68 });
  const bronze = material('#ac835b', { map:cast, metalness:.50, roughness:.47 });
  const threshold = material('#9b7860', { metalness:.32, roughness:.72 });
  const black = material('#141519');
  const styles = new Map(Object.entries(palette).map(([key,[ground,wall,lamp]]) => [key, {
    floor: material(ground,{ map:cast,bumpMap:cast,bumpScale:.024,roughness:.83 }),
    side: material(wall,{ map:enamel,bumpMap:enamel,bumpScale:.045,roughness:.84,side:THREE.DoubleSide }),
    lamp: material(lamp,{ color:lamp,emissive:lamp,emissiveIntensity:.62 }),
    glow: lamp
  }]));
  const lights = [];
  const ambient = new THREE.HemisphereLight('#d6dce5','#826d72',.92);
  world.add(ambient);
  const sun = new THREE.DirectionalLight('#ffcf9e',2.05);
  sun.position.set(-18,26,-10);
  world.add(sun);

  function panel(corners, surface) {
    const mesh = new THREE.BufferGeometry();
    const width = new THREE.Vector3(...corners[0]).distanceTo(new THREE.Vector3(...corners[1]));
    const height = new THREE.Vector3(...corners[0]).distanceTo(new THREE.Vector3(...corners[3]));
    mesh.setAttribute('position',new THREE.Float32BufferAttribute(corners.flat(),3));
    mesh.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,width/4,0,width/4,height/4,0,height/4],2));
    mesh.setIndex([0,1,2,0,2,3]);
    mesh.computeVertexNormals();
    geometry.add(mesh);
    world.add(new THREE.Mesh(mesh,surface));
  }

  function wall(cell,side,start,end,base,top,surface) {
    const xSide = side.startsWith('x');
    const from = along => xSide ? [cell[side],along] : [along,cell[side]];
    const [xa,za] = from(start);
    const [xb,zb] = from(end);
    const a = levelAt(cell,za), b = levelAt(cell,zb);
    panel([[xa,a+base,za],[xb,b+base,zb],[xb,b+top,zb],[xa,a+top,za]],surface);
  }

  function addLamp(x,y,z,color,intensity) {
    const light = new THREE.PointLight(color,intensity,10,2);
    light.position.set(x,y,z);
    world.add(light);
    lights.push(light);
  }

  function ribs(cell, style) {
    const rows = cell.style === 'ramp' || cell.style === 'gut' ? 6 : 4;
    for (let row = 0; row < rows; row++) {
      const z = cell.z0+(row+.45)/rows*(cell.z1-cell.z0);
      const y = levelAt(cell,z);
      const mid = (cell.x0+cell.x1)/2;
      const wide = cell.x1-cell.x0;
      const curve = new THREE.CatmullRomCurve3(Array.from({length:11},(_,i) => {
        const a = i/10;
        return new THREE.Vector3(mid+(a-.5)*(wide-.05),
          y+cell.height-.21-(.91+.24*Math.cos(row*1.9))*Math.pow(Math.abs(a*2-1),2.8),
          z+.105*Math.sin(a*6.28+row));
      }));
      const rib = new THREE.TubeGeometry(curve,30,cell.style === 'gut' ? .13 : .079,8,false);
      geometry.add(rib);
      world.add(new THREE.Mesh(rib,cell.style==='gut' ? style.side : trim));
      box(.81,.046,.16,style.lamp,world,mid,y+cell.height-.28,z);
      if (row%2===0) addLamp(mid,y+cell.height-.58,z,style.glow,cell.style==='market' ? 20 : 15);
    }
  }

  for (const cell of districts) {
    const {x0,x1,z0,z1,north,south,height,style:kind} = cell;
    const style = styles.get(kind);
    panel([[x0,north,z0],[x0,south,z1],[x1,south,z1],[x1,north,z0]],style.floor);
    if (height) {
      panel([[x0,north+height,z0],[x1,north+height,z0],[x1,south+height,z1],[x0,south+height,z1]],style.side);
      ribs(cell,style);
    }
    for (const side of ['x0','x1','z0','z1']) {
      for (const [start,end,low,top] of wallSections(cell,side,doors)) wall(cell,side,start,end,low,top,style.side);
    }
  }

  for (const door of doors) {
    const {game,x,y,z,yaw,cell,index} = door;
    const frame = new THREE.Group();
    frame.position.set(x,y,z);
    frame.rotation.y = yaw;
    world.add(frame);
    const pigment = game?.shellColors?.top || '#e4ac79';
    const lamp = material(pigment,{ emissive:pigment,emissiveIntensity:.38 });
    if (!cell.height) {
      box(2.02,3.01,.57,styles.get('outside').side,frame,0,1.47,-.60);
      box(2.12,.15,.88,bronze,frame,0,2.99,-.29);
      for (const x of [-.94,.94]) box(.059,2.37,.28,bronze,frame,x,1.23,-.15);
    }
    box(1.62,2.52,.13,black,frame,0,1.23,-.20);
    for (const side of [-1,1]) {
      box(.17,2.54,.36,trim,frame,side*.85,1.26,.015);
      box(.047,2.26,.074,lamp,frame,side*.846,1.245,.211);
    }
    box(1.86,.18,.40,trim,frame,0,2.52,.018);
    box(1.64,.039,.35,threshold,frame,0,.015,.019);
    if (game) plane(.57,.77,paper(texture('../'+game.cover)),frame,0,1.45,-.118);
    sign(game?.title || 'Apartment', game ? `EXHIBIT ${String(index).padStart(2,'0')}` : 'RESIDENCE',
      pigment,frame,0,2.77,.147,0,1.82);
    door.point = new THREE.Vector3(x-door.nx*.16,y+1.51,z-door.nz*.16);
  }

  // Finished shopfronts and separate canopy, mullions and kick plate.
  const storeTexture = texture('./art/district-market.webp?v=f69ac3bbd38f');
  const glass = material('#ede5d5',{map:storeTexture,emissive:'#fff0d7',emissiveMap:storeTexture,
    emissiveIntensity:.29,roughness:.58});
  storeTexture.wrapS = storeTexture.wrapT = THREE.ClampToEdgeWrapping;
  const storefront = new THREE.Group();
  storefront.position.set(-6.58,0,1.445);
  storefront.rotation.y = Math.PI;
  world.add(storefront);
  plane(5.51,3.32,glass,storefront,0,1.67,0);
  for (const x of [-2.79,2.79]) box(.10,3.52,.28,trim,storefront,x,1.73,.13);
  box(5.76,.23,.78,bronze,storefront,0,3.49,.30);
  box(5.47,.26,.16,trim,storefront,0,.125,.10);
  box(.035,2.11,.075,bronze,storefront,-1.22,1.53,.064);
  box(.035,2.11,.075,bronze,storefront,.19,1.53,.064);
  box(2.88,.028,.12,bronze,storefront,-1.28,.45,.063);
  addLamp(-6.48,2.64,.19,'#ffd4a0',13);
  sign('Enamel Market','ZANG NEIGHBORHOODS','#efd18f',world,-6.32,3.39,-6.975,0,2.28);
  sign('Trashland','SALVAGE RAMP','#efc297',world,-11,2.76,-6.925,0,2.05);
  sign('Sorting Roof','UPPER WALK','#d0dbd6',world,3.0,2.92,-6.92,0,1.84);
  sign('Gut Punch Works','FREIGHT DESCENT','#e9a490',world,-12.0,2.78,1.44,Math.PI,2.12);
  sign('Apartment','SERVICE RETURN','#ffbc97',world,2.33,-1.51,14.1,Math.PI,1.91);

  const horizon = texture('./art/district-trashland.webp?v=b26b87f38a80');
  horizon.wrapS = horizon.wrapT = THREE.ClampToEdgeWrapping;
  const sky = paper(horizon);
  sky.side = THREE.DoubleSide;
  const skyline = plane(100,46,sky,world,-8,16,-59);
  skyline.name = 'Salvage skyline';
  const flank = plane(66,35,sky,world,-47,13,-31);
  flank.rotation.y = Math.PI/2;
  const other = plane(66,35,sky,world,37,13,-31);
  other.rotation.y = Math.PI/2;

  const outside = styles.get('outside');
  for (const [i,x,z] of [[0,-11.9,-23.1],[1,-7.74,-21.73]]) {
    for (let layer=0;layer<4;layer++) {
      const slab=box(1.20-.12*layer,.22,.89-.05*i,layer%2?bronze:outside.side,
        world,x+.18*Math.sin(layer*2),3.63+layer*.235,z);
      slab.rotation.y = i*.45-layer*.092;
    }
    box(.66,.07,.38,outside.lamp,world,x,4.61,z);
  }
  // Backflow landmark on the lower loop.
  const valve = new THREE.Group();
  valve.position.set(-12.6,-2.22,20.23);
  world.add(valve);
  const ring = new THREE.TorusGeometry(.59,.071,12,40);
  geometry.add(ring);
  valve.add(new THREE.Mesh(ring,bronze));
  for (let i=0;i<3;i++) box(.072,1.045,.1,trim,valve).rotation.z=i*Math.PI/3;
  box(.32,.32,1.37,trim,valve,0,0,1.02);
  const manifold = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-13.70,-4.1,21.1),
    new THREE.Vector3(-13.67,-2.24,21.64),
    new THREE.Vector3(-12.6,-2.22,21.70),
    new THREE.Vector3(-12.3,-.25,21.7),
    new THREE.Vector3(-8.99,.36,21.68)
  ]);
  const feed = new THREE.TubeGeometry(manifold,40,.23,10,false);
  geometry.add(feed);
  world.add(new THREE.Mesh(feed,bronze));
  addLamp(-12.05,-1.14,19.6,'#ff5872',13);
  return { doors,lights,sun,ambient };
}
