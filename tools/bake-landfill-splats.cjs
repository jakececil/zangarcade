// Extract the coastal scenery from the draft SPZ. Rebuild from the original
// file each time so this grade never compounds across iterations.
const fs = require('node:fs');
const { gzipSync, gunzipSync } = require('node:zlib');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node bake-landfill-splats.cjs source.spz coast.spz');
const data = gunzipSync(fs.readFileSync(source));
const total = data.readUInt32LE(8);
if (data.toString('ascii', 0, 4) !== 'NGSP' || data.readUInt32LE(4) !== 2 ||
    data[12] !== 0 || data.length !== 16 + total * 19) {
  throw new Error('Expected the zero-SH SPZ v2 Landfill draft.');
}
const unit = 2 ** data[13];
const starts = [16, 16 + total * 9, 16 + total * 10, 16 + total * 13, 16 + total * 16];
const strides = [9, 1, 3, 3, 3];
const selection = [];
const opacity = [];

for (let i = 0; i < total; i++) {
  const pos = 16 + i * 9;
  const x = data.readIntLE(pos, 3) / unit;
  const y = data.readIntLE(pos + 3, 3) / unit;
  const z = data.readIntLE(pos + 6, 3) / unit;
  const ground = -.18 * Math.max(0, Math.min(8, -5 - z));
  const shore = Math.abs(x) > 10.7 || z < -17.2;
  const cut = Math.max(0, Math.min(1, (-z - 1.6) / 3.9));
  const a = Math.round(data[starts[1] + i] * cut);
  // The sea and sky stay live in the exhibit. Remove their baked samples and
  // isolated outliers above the scrap banks.
  if (a < 4 || Math.abs(x) > 39 || z < -39 || y > 9.4) continue;
  if (Math.abs(x) < 8.5 && z < -9 && y > 1.86) continue;
  if (Math.abs(x) < 16 && z < -27) continue;
  if (shore ? y < -1.63 : y < ground - .38) continue;
  selection.push(i);
  opacity.push(a);
}

const result = Buffer.alloc(16 + selection.length * 19);
data.copy(result, 0, 0, 16);
result.writeUInt32LE(selection.length, 8);
let offset = 16;
for (let section = 0; section < strides.length; section++) {
  const stride = strides[section];
  for (const [index, original] of selection.entries()) {
    const start = starts[section] + original * stride;
    if (section === 1) result[offset] = opacity[index];
    else data.copy(result, offset, start, start + stride);
    offset += stride;
  }
}
fs.writeFileSync(destination, gzipSync(result, { level: 9 }));
console.log(`Selected ${selection.length.toLocaleString()} of ${total.toLocaleString()} splats.`);
