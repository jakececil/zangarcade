// The walkable plan uses adjoining rectangles. Elevations are metres above
// the apartment landing. Ramps interpolate between the north and south ends.
export const districts = [
  { id:'landing', name:'Apartment Landing', x0:-3,x1:4.5,z0:-.5,z1:5, north:0,south:0, height:3.7, style:'landing' },
  { id:'bend', name:'ZANG Arcade', x0:-3,x1:5,z0:-7,z1:-.5, north:0,south:0, height:4.5, style:'market' },
  { id:'market', name:'Enamel Market', x0:-14,x1:-3,z0:-7,z1:1.5, north:0,south:0, height:5.1, style:'market' },
  { id:'west-rise', name:'Salvage Ramp', x0:-13,x1:-9,z0:-17,z1:-7, north:3.5,south:0, height:3.1, style:'ramp' },
  { id:'trashland', name:'Trashland Overlook', x0:-14,x1:-4,z0:-26,z1:-17, north:3.5,south:3.5, height:0, style:'outside' },
  { id:'catwalk', name:'Sorting Roof', x0:-4,x1:5,z0:-22,z1:-17, north:3.5,south:3.5, height:0, style:'outside' },
  { id:'east-rise', name:'Freight Ramp', x0:1,x1:5,z0:-17,z1:-7, north:3.5,south:0, height:3.25, style:'ramp' },
  { id:'west-drop', name:'Service Descent', x0:-14,x1:-10,z0:1.5,z1:13.5, north:0,south:-4.2, height:3.05, style:'gut' },
  { id:'gut', name:'Gut Punch Works', x0:-14,x1:-3,z0:13.5,z1:22, north:-4.2,south:-4.2, height:5.1, style:'gut' },
  { id:'backflow', name:'Backflow Crosscut', x0:-3,x1:4.5,z0:14,z1:19, north:-4.2,south:-4.2, height:3.4, style:'gut' },
  { id:'return', name:'Apartment Service Ramp', x0:.25,x1:4.5,z0:5,z1:14, north:0,south:-4.2, height:3.1, style:'ramp' }
];

export const arrivals = {
  corridor: [0, 3, 0],
  market: [-5.5, -3.25, Math.PI / 2],
  trashland: [-10.9, -18.7, 0],
  works: [-11.9, 15.26, Math.PI],
  'gut-punch': [-11.9, 15.26, Math.PI]
};

const slots = [
  ['landing','z1',-1.34,'home'],
  ['bend','x1',-5.68,'blamball'], ['bend','x1',-3.61,'zonk'], ['bend','x1',-1.57,'sugar-drum'],
  ['bend','z0',-1.98,'parasol'], ['bend','z0',-.02,'the-weather-engine'],
  ['market','z0',-8.02,'garden-song'], ['market','z0',-5.5,'cats-cradle'],
  ['market','x0',-5.77,'jumbo-mini-golf'], ['market','x0',-3.48,'triple-giblet'],
  ['market','x0',-.80,'little-company'],
  ['trashland','z0',-12.50,'trashland-pinball'], ['trashland','z0',-9.97,'landfill'],
  ['trashland','z0',-7.36,'swamp-rocket'], ['catwalk','z0',.02,'lighthouse-keeper'],
  ['gut','z1',-11.44,'gut-punch-lower-management'], ['gut','z1',-8.60,'gut-punch-specimen-run'],
  ['gut','z1',-5.19,'undergrowth-advance'], ['backflow','z1',-1.4,'kingfisher'],
  ['backflow','z1',2.2,'riverbed']
];

const outward = { x0:[-1,0], x1:[1,0], z0:[0,-1], z1:[0,1] };
const doorWidth = .79;
const doorHeight = 2.47;
const clear = .22;
const footprint = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.71,.71],[.71,-.71],[-.71,.71],[-.71,-.71]];
const covers = (cell,x,z) => x >= cell.x0 && x <= cell.x1 && z >= cell.z0 && z <= cell.z1;
export const cellAt = (x,z) => districts.find(cell => covers(cell,x,z));
export const levelAt = (cell,z) => cell.north + (cell.south-cell.north)*(z-cell.z0)/(cell.z1-cell.z0);

export function districtDoors(games) {
  const byId = new Map(games.map(game => [game.id,game]));
  return slots.flatMap(([id,side,offset,gameId], index) => {
    const game = byId.get(gameId);
    if (!game && gameId !== 'home') return [];
    const cell = districts.find(candidate => candidate.id === id);
    const [nx,nz] = outward[side];
    const x = nx ? cell[side] : offset;
    const z = nx ? offset : cell[side];
    const y = levelAt(cell,z);
    const yaw = Math.atan2(-nx,-nz);
    return [{ id:game ? 'door:'+game.id : 'home', game, cell, side, index, x,y,z,nx,nz,yaw,
      arrival: { x:x-nx*1.27, y, z:z-nz*1.27, yaw:yaw+Math.PI } }];
  });
}

function boundary(cell,side) {
  const axis = side[0], span = axis === 'x' ? 'z' : 'x';
  const lo = cell[span+'0'], hi = cell[span+'1'];
  const opposite = axis+(side[1] === '0' ? '1' : '0');
  const joins = districts.filter(other => other !== cell && other[opposite] === cell[side]
    && other[span+'1'] > lo && other[span+'0'] < hi);
  const points = [lo,hi,...joins.flatMap(other => [Math.max(lo,other[span+'0']), Math.min(hi,other[span+'1'])])]
    .sort((a,b) => a-b);
  return points.slice(0,-1).flatMap((start,i) => {
    const end = points[i+1];
    if (end-start < .001) return [];
    const middle = (start+end)/2;
    const neighbor = joins.find(other => middle > other[span+'0'] && middle < other[span+'1']);
    return [{ start,end,neighbor }];
  });
}

export function wallSections(cell,side,doors) {
  const positions = doors.filter(door => door.cell === cell && door.side === side)
    .map(door => side.startsWith('x') ? door.z : door.x).sort((a,b)=>a-b);
  return boundary(cell,side).flatMap(({start,end,neighbor}) => {
    if (neighbor) return neighbor.height && cell.height > neighbor.height
      ? [[start,end,neighbor.height,cell.height]] : [];
    const top = cell.height || .53;
    const strips = [];
    let left = start;
    for (const center of positions) {
      if (center <= start || center >= end) continue;
      const before = Math.max(start,center-doorWidth);
      const after = Math.min(end,center+doorWidth);
      if (before > left) strips.push([left,before,-.13,top]);
      if (top > doorHeight) strips.push([before,after,doorHeight,top]);
      left = after;
    }
    if (end > left) strips.push([left,end,-.13,top]);
    return strips;
  });
}

const blockers = [
  [-4.18,-6.24,.64,.57], [3.96,3.44,.44,.55],
  [-11.9,-23.1,.66,.71], [-7.74,-21.73,.78,.57], [-12.6,19.2,.70,.58]
];
export function canWalkDistrict(x,z) {
  if (blockers.some(([bx,bz,rx,rz]) => Math.abs(x-bx) < rx+clear && Math.abs(z-bz) < rz+clear)) return false;
  return footprint.every(([dx,dz]) => Boolean(cellAt(x+dx*clear,z+dz*clear)));
}

export function crossingPortal(doors, from, x,z) {
  const local = cellAt(from.x,from.z);
  return doors.find(door => {
    if (door.cell !== local) return false;
    const before = (door.x-from.x)*door.nx + (door.z-from.z)*door.nz;
    const after = (door.x-x)*door.nx + (door.z-z)*door.nz;
    return before >= .31 && after < .31
      && Math.abs((x-door.x)*door.nz-(z-door.z)*door.nx) < .64;
  });
}
