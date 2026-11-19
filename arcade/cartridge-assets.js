const site = new URL('../', import.meta.url);
const models = new Map();

export function loadCartridgeAsset(path) {
  const url = new URL(path, site);
  if (!url.href.startsWith(site.href)) return Promise.reject(new Error('Cartridge model is outside the arcade.'));
  if (!models.has(url.href)) {
    models.set(url.href, import('./vendor/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url.href))
      .then(gltf => gltf.scene)
      .catch(error => {
        models.delete(url.href);
        throw error;
      }));
  }
  return models.get(url.href);
}
