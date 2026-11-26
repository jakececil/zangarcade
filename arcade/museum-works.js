import * as THREE from './vendor/three.module.js';

// Units are metres. Each module shares an edge with the next one.
// Both the walkable floor and the cut-outs in its walls come from this plan.
const works = [
  { name: 'Service Cut', x0:-8, x1:-3.15, z0:-2.90, z1:-1.10, h:2.43, accent:'#e1a66a' },
  { name: 'Mycelium Court', x0:-14, x1:-8, z0:-6.35, z1:-.72, h:4.74, accent:'#aace65' },
  { name: 'Copper Run', x0:-14, x1:-11.66, z0:-10.9, z1:-6.35, h:2.36, accent:'#d57852' },
  { name: 'Coolant Bypass', x0:-9.94, x1:-8, z0:-10.9, z1:-6.35, h:2.84, accent:'#6bc7bd' },
  { name: 'Filter Room', x0:-17.65, x1:-14, z0:-9.71, z1:-7.62, h:3.31, accent:'#cc83aa' },
  { name: 'Backflow Vault', x0:-14, x1:-8, z0:-15.75, z1:-10.9, h:3.78, accent:'#6bc7bd' },
  { name: 'Return Cut', x0:-8, x1:-3.15, z0:-14.90, z1:-13.10, h:2.43, accent:'#e1a66a' }
];

export const worksArrival = { x: -4.82, z: -2, yaw: Math.PI / 2 };
const inside = ({ x0, x1, z0, z1 }, x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const clearance = .20;
const corners = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.71,.71],[.71,-.71],[-.71,.71],[-.71,-.71]];

function wallSegments(rect, side, layout) {
  const [key, across] = side[0] === 'x' ? ['x','z'] : ['z','x'];
  const low = rect[across+'0'];
  const high = rect[across+'1'];
  const opposite = key+(side[1] === '0' ? '1' : '0');
  const joins = layout.filter(other => other !== rect && other[opposite] === rect[side]
    && other[across+'1'] > low && other[across+'0'] < high);
  const marks = [low,high,...joins.flatMap(join => [
    Math.max(low,join[across+'0']), Math.min(high,join[across+'1'])
  ])].sort((a,b) => a-b);
  return marks.slice(0,-1).flatMap((start,i) => {
    const end = marks[i+1];
    const middle = (start+end)/2;
    const neighbor = joins.find(join => middle > join[across+'0'] && middle < join[across+'1']);
    const sill = neighbor?.h ?? 0;
    return end-start > .001 && sill < rect.h ? [{ start, end, sill }] : [];
  });
}

export function worksPlan(hall) {
  const layout = [hall,...works];
  return {
    outerWalls(rect, side) { return wallSegments(rect, side, layout); },
    canWalk(x,z) {
      return corners.every(([dx,dz]) => layout.some(rect => inside(rect,x+dx*clearance,z+dz*clearance)));
    },
    area(x,z) { return works.find(rect => inside(rect,x,z))?.name || 'Exhibition Corridor'; },
    hasCut(side,z) {
      return side < 0 && works.some(rect => rect.x1 === hall.x0 && z > rect.z0 && z < rect.z1);
    }
  };
}

export function buildMuseumWorks({ world, plan, sign, box, material, texture, geometry }) {
  const cast = texture('./art/cast-charcoal.webp?v=f9ec788c4039', 2);
  const grit = texture('./art/guts-enamel.webp', 2);
  const floor = material('#90917c', { map: cast, bumpMap: cast, bumpScale: .027, roughness: .88 });
  const wall = material('#73826f', { map: grit, bumpMap: grit, bumpScale: .052, roughness: .84 });
  const roof = material('#635e57', { map: cast, roughness: .89 });
  const ribs = material('#5c5b58', { map: cast, bumpMap: cast, bumpScale: .024, roughness: .56, metalness: .29 });
  const roots = material('#5e5038', { map: grit, roughness: .94 });
  const pipe = material('#aa765a', { map: cast, roughness: .43, metalness: .48 });
  const growth = material('#86934d', { map: grit, roughness: .82 });
  const wheelPaint = material('#953b31', { map: cast, roughness: .51, metalness: .35 });
  const bulbGeometry = new THREE.IcosahedronGeometry(1, 2);
  geometry.add(bulbGeometry);
  const lights = [];

  function tube(points,radius,surface, parent) {
    const mesh = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,radius,8,false);
    geometry.add(mesh);
    parent.add(new THREE.Mesh(mesh,surface));
  }

  function node(parent,surface,position,scale,yaw) {
    const bead = new THREE.Mesh(bulbGeometry,surface);
    bead.position.set(...position);
    bead.scale.set(...scale);
    bead.rotation.y = yaw;
    parent.add(bead);
  }

  for (const [index, rect] of works.entries()) {
    const { x0,x1,z0,z1,h,accent,name } = rect;
    const width = x1-x0, depth = z1-z0;
    const x = (x0+x1)/2, z = (z0+z1)/2;
    const room = new THREE.Group();
    room.name = name;
    world.add(room);
    box(width,.12,depth,floor,room,x,-.055,z);
    box(width,.13,depth,roof,room,x,h+.057,z);
    for (const side of ['x0','x1','z0','z1']) {
      for (const {start,end,sill} of plan.outerWalls(rect,side)) {
        const mid = (start+end)/2;
        const vertical = side.startsWith('x');
        const coordinate = rect[side]+(side.endsWith('0') ? -.04 : .04);
        box(vertical ? .08 : end-start,h-sill,vertical ? end-start : .08,
            wall,room,vertical?coordinate:mid,(h+sill)/2,vertical?mid:coordinate);
      }
    }
    const strip = material(accent, { emissive: accent, emissiveIntensity: .55 });
    const longX = width > depth && h < 3.4;
    const bays = longX ? 4 : h > 3.5 ? 5 : 3;
    for (let bay = 0; bay < bays; bay++) {
      const along = (bay+.55)/bays;
      const centre = longX ? x0+width*along : z0+depth*along;
      const span = longX ? depth : width;
      const across = longX ? z : x;
      const shaped = Array.from({length:9}, (_,i) => {
        const t = i/8;
        const w = across + (t-.5)*(span-.07);
        const y = h - (.72+.27*Math.sin(index*.8 + bay*1.6))*Math.pow(Math.abs(2*t-1),2.2)
          -.07*Math.sin(t*6.28+bay);
        return longX ? new THREE.Vector3(centre,y,w) : new THREE.Vector3(w,y,centre);
      });
      tube(shaped,h>3.5?.113:.070,bay%2 === 0 ? ribs : roots,room);
      const chrome = longX
        ? box(.34,.055,.69,strip,room,centre,h-.15,z)
        : box(.69,.055,.33,strip,room,x,h-.17,centre);
      chrome.rotation.y = .10*Math.sin(bay+index);
    }
    const light = new THREE.PointLight(accent, h>3.5 ? 26 : 13, 8.4, 2);
    light.position.set(x+.20,h-.66,z+.12);
    room.add(light);
    lights.push(light);

    if (name === 'Mycelium Court') {
      const ceiling = new THREE.Vector3(x-.56,h-.19,z+.52);
      const lantern = new THREE.Vector3(x-.42,2.78,z+.23);
      for (let i = 0; i < 7; i++) {
        const angle = i*Math.PI*2/7;
        tube([ceiling.clone().add(new THREE.Vector3(Math.cos(angle)*1.06,0,Math.sin(angle))),
          lantern.clone().add(new THREE.Vector3(Math.cos(angle)*.48,.72,Math.sin(angle)*.46)),
          lantern.clone().add(new THREE.Vector3(Math.cos(angle)*.20,-.17,Math.sin(angle)*.16))],
        .047,roots,room);
        node(room,i%3 ? growth : strip,[lantern.x+Math.cos(angle)*.27,2.84+.08*Math.sin(i*4),lantern.z+Math.sin(angle)*.25],
             [.186,.30,.174],angle);
      }
      const spill = new THREE.PointLight('#d0ef78',11,5.4,2);
      spill.position.copy(lantern);
      room.add(spill);
      lights.push(spill);
      for (let i = 0; i < 5; i++) {
        const start = z0+.73+i*.84;
        tube([
          new THREE.Vector3(x0-.05,.08,start-.43),
          new THREE.Vector3(x0+.14,1.18+.15*Math.cos(i),start),
          new THREE.Vector3(x0+.17,2.24,start+.38*Math.sin(i*3)),
          new THREE.Vector3(x0+.10,3.30,start+.27),
          new THREE.Vector3(x0+.62,h-.12,start+.73)
        ],.076+.019*i,i%2 ? roots : growth,room);
        node(room,growth,[x0+.096,.62+i*.47,start+.04],[.205,.27,.31],i*.7);
      }
      for (const xDoor of [-12.83,-8.97]) {
        const gutter = box(1.02,.023,.046,strip,room,xDoor,.016,z0+.35);
        gutter.rotation.y = .045;
      }
    } else if (name === 'Backflow Vault') {
      for (let i = 0; i<3; i++) {
        const height = 1+.38*i;
        tube([
          new THREE.Vector3(x0+.12,height,z0+.23),
          new THREE.Vector3(x-1.56,height+.06,z0+.25),
          new THREE.Vector3(x+1.74,height+.02,z0+.25),
          new THREE.Vector3(x1-.22,height+.56,z0+.41),
          new THREE.Vector3(x1-.22,h-.04,z0+.57)
        ],.093,pipe,room);
      }
      const valve = new THREE.Group();
      valve.position.set(-11.8,1.46,z0+.53);
      room.add(valve);
      const ring = new THREE.TorusGeometry(.26,.034,10,36);
      geometry.add(ring);
      valve.add(new THREE.Mesh(ring,wheelPaint));
      for (let i = 0; i < 3; i++) {
        const spoke = box(.052,.444,.058,wheelPaint,valve);
        spoke.rotation.z = i*Math.PI/3;
      }
      box(.14,.14,.38,pipe,valve,0,0,-.13);
      const trench = box(1.82,.025,.77,ribs,room,-11.55,.0125,z0+1.42);
      trench.rotation.y = .055;
      for (let i = 0; i < 12; i++) box(.042,.022,.64,wall,room,-12.31+.139*i,.026,z0+1.42);
    } else if (name === 'Filter Room') {
      for (let i = 0; i<3; i++) {
        const dz = .49*i;
        box(.41,2.19,.39,ribs,room,x0+.21,1.09,z0+.55+dz);
        box(.06,1.64,.095,strip,room,x0+.411,1.29,z0+.55+dz);
      }
    }
  }

  const brass = '#eab976';
  for (const z of [-2,-14]) sign('The Works','SERVICE ACCESS',brass,world,-3.07,2.65,z,Math.PI/2,1.63);
  sign('Mycelium Court','ANNEX', '#bfe378',world,-8.22,3.25,-1.99,Math.PI/2,2.15);
  sign('Copper Run','LEFT FORK', '#e5a076',world,-12.84,2.38,-6.34,0,1.57);
  sign('Coolant Bypass','RIGHT FORK', '#81dacc',world,-8.97,2.87,-6.34,0,1.57);
  sign('Filter Room','WORKSHOP', '#db9ec2',world,-13.99,2.55,-8.69,Math.PI/2,1.50);
  sign('Backflow Vault','ANNEX', '#81dacc',world,-10.76,2.23,-15.64,0,2.15);
  for (const z of [-2,-14]) sign('Exhibition Corridor','RETURN TO GALLERIES',brass,world,-8.06,2.73,z,-Math.PI/2,1.75);

  return lights;
}
