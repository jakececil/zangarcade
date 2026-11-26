// Exports 16-bit Chisel depth targets from the same layout used by the arcade.
// Run with Node 22+, Playwright, and Chrome. See arcade/README.md.
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { deflateSync } = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || 'landfill-chisel');
const origin = 'http://landfill.test';
const width = 1280;
const height = 720;
const zMin = .5;
const zMax = 120;

function png16(pixels) {
  const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
    let crc = byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    return crc;
  });
  function chunk(name, contents) {
    const type = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(contents.length);
    let crc = 0xffffffff;
    for (const buffer of [type, contents]) {
      for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    }
    const check = Buffer.alloc(4);
    check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, type, contents, check]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 16;
  const stride = width * 2 + 1;
  const scanlines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((height - 1 - y) * width + x) * 4;
      const target = y * stride + x * 2 + 1;
      scanlines[target] = pixels[source];
      scanlines[target + 1] = pixels[source + 1];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))
  ]);
}

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ['--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage();
    await page.route(origin + '/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html>' });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !file.endsWith('.js')) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: await readFile(file) });
    });
    await page.goto(origin);
    const capture = await page.evaluateHandle(async ({ width, height, zMin, zMax }) => {
      const THREE = await import('/arcade/vendor/three.module.js');
      const { landfillLayout, waterLevel } = await import('/arcade/landfill-layout.js');
      const renderer = new THREE.WebGLRenderer();
      const scene = new THREE.Scene();
      const target = new THREE.WebGLRenderTarget(width, height);
      const camera = new THREE.PerspectiveCamera(58, width / height, .05, zMax);
      const material = new THREE.ShaderMaterial({
        uniforms: { zMin: { value: zMin }, zMax: { value: zMax } },
        vertexShader: `
          varying float depthZ;
          void main() {
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            depthZ = -view.z;
            gl_Position = projectionMatrix * view;
          }`,
        fragmentShader: `
          uniform float zMin, zMax;
          varying float depthZ;
          void main() {
            float sampleValue = clamp(round(65535.0 * (1.0 - log(depthZ / zMin) / log(zMax / zMin))), 1.0, 65535.0);
            gl_FragColor = vec4(floor(sampleValue / 256.0) / 255.0, mod(sampleValue, 256.0) / 255.0, 0.0, 1.0);
          }`
      });
      landfillLayout(part => {
        const geometry = part.shape === 'box'
          ? new THREE.BoxGeometry(...part.size) : new THREE.CylinderGeometry(...part.size);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(part.x, part.y, part.z);
        mesh.rotation.set(part.rx, part.ry, part.rz);
        scene.add(mesh);
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(168, 120), material);
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, waterLevel, -68);
      scene.add(water);
      return (position, subject) => {
        camera.position.set(...position);
        camera.lookAt(...subject);
        camera.updateMatrixWorld();
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const buffer = new Uint8Array(width * height * 4);
        renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer);
        const focal = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        let binary = '';
        for (let i = 0; i < buffer.length; i += 32768) binary += String.fromCharCode(...buffer.subarray(i, i + 32768));
        return {
          bytes: btoa(binary),
          camera: {
            extrinsics: { coordinateSystem: 'rub', position, quaternion: camera.quaternion.toArray() },
            intrinsics: { width, height, fx: focal, fy: focal, cx: width / 2, cy: height / 2 }
          }
        };
      };
    }, { width, height, zMin, zMax });
    const views = [
      ['arrival', [0, 1.62, 19.37], [0, 4.1, 4.65]],
      ['sorting-floor', [-3.8, 1.7, 11.15], [1.1, 4.1, 4.3]],
      ['ramp', [-2.6, 1.55, -2.2], [3.4, -.2, -13.4]],
      ['coast', [-3.4, .25, -10.3], [4.0, -.26, -16.1]],
      ['reverse', [1, .18, -16.1], [-.8, 4.4, 4.65]],
      ['horizon', [0, .18, -18.3], [0, .18, -45]]
    ];
    const files = [];
    for (const [name, position, subject] of views) {
      const { camera, bytes } = await capture.evaluate((render, args) => render(...args), [position, subject]);
      const file = name + '-depth.png';
      await writeFile(path.join(out, file), png16(Buffer.from(bytes, 'base64')));
      files.push({ name, camera, file, zMin, zMax });
    }
    await writeFile(path.join(out, 'cameras.json'), JSON.stringify(files, null, 2) + '\n');
    console.log(`Wrote ${files.length} depth targets to ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
