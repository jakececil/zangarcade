import { ShaderChunk } from './vendor/three.module.js';

const site = new URL('../', import.meta.url);
const models = new Map();

function prepareGlazing(scene) {
  scene.traverse(object => {
    const material = object.material;
    if (!material?.userData?.cartridgeClearGlazing) return;
    // Keep the reflection lobe from the standard shader. Thin clear glazing
    // needs less transmission blur than the floor used for frosted materials.
    const transmission = ShaderChunk.transmission_pars_fragment
      .replace('applyIorToRoughness( roughness, ior );',
        'applyIorToRoughness( min( roughness, 0.012 ), ior );')
      .replace('textureBicubic( transmissionSamplerMap, fragCoord.xy, lod )',
        'textureLod( transmissionSamplerMap, fragCoord.xy, lod )');
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_pars_fragment>', transmission
      );
    };
    material.customProgramCacheKey = () => 'zang-clarity-glazing';
  });
  return scene;
}

export function loadCartridgeAsset(path) {
  const url = new URL(path, site);
  if (!url.href.startsWith(site.href)) return Promise.reject(new Error('Cartridge model is outside the arcade.'));
  if (!models.has(url.href)) {
    models.set(url.href, import('./vendor/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url.href))
      .then(gltf => prepareGlazing(gltf.scene))
      .catch(error => {
        models.delete(url.href);
        throw error;
      }));
  }
  return models.get(url.href);
}
