import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from './vendor/three.module.js';

export function createCartridgeReflections() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#666066';
  context.fillRect(0, 0, 256, 128);
  const softbox = context.createLinearGradient(0, 35, 0, 82);
  softbox.addColorStop(0, '#666066');
  softbox.addColorStop(.43, '#fff7ed');
  softbox.addColorStop(.65, '#dfecff');
  softbox.addColorStop(1, '#666066');
  context.fillStyle = softbox;
  context.fillRect(0, 35, 256, 47);
  context.fillStyle = '#fff2e4';
  context.fillRect(31, 39, 52, 23);
  context.fillStyle = '#bedbff';
  context.fillRect(171, 45, 25, 33);
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function enableCartridgeShadows(model) {
  let hasCaster = false;
  let hasReceiver = false;
  model.traverse(part => {
    const role = part.userData.cartridgeShadow;
    if (!role) return;
    const casts = role === 'cast' || role === 'both';
    const receives = role === 'receive' || role === 'both';
    part.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = casts;
      mesh.receiveShadow = receives;
      hasCaster ||= casts;
      hasReceiver ||= receives;
    });
  });
  return hasCaster && hasReceiver;
}

export function configureCartridgeKey(light) {
  light.position.set(-.59, .30, .45);
  const shadow = light.shadow;
  Object.assign(shadow.camera, {
    left: -.35, right: .35, top: .35, bottom: -.35, near: .25, far: 1.25
  });
  shadow.camera.updateProjectionMatrix();
  shadow.mapSize.set(512, 512);
  shadow.radius = 3.5;
  shadow.bias = -.00035;
  shadow.normalBias = .00045;
  shadow.intensity = .94;
}
