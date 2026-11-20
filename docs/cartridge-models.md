# Making cartridges for ZANG Arcade

ZONK is the painted-shell and fitted-label example. Undergrowth Advance is the translucent-shell example. Both start with the generated mesh and use the same connector coordinates in the arcade.

## Art masters

1. Generate an isolated **straight-on front** on a neutral background. The whole cartridge should fit in frame. Give it an open label area and a centered contact tongue. Lock the silhouette before making the other views.
2. Use that image as a reference for a matched **side and rear**. The side establishes the thickness and the step at the connector. The rear establishes seams, ribs, and the materials seen from behind. Match the silhouettes before using the views in Blender.
3. Generate the print separately using the game's box art and the dimensions of the actual label well. ZONK uses a cream and black print with a restrained yellow accent. The shell supplies the rainbow. Its square tiles and rotary phone refer to the game, and **RATED Z / WEIRD CALLS** is a fictional rating.

Keep full-resolution references, dense GLBs, raw textures, and Blender files outside the Pages folder. Bring only the optimized GLB and the optional flat WebP print into the site.

## Run reconstruction and finish the models

The pinned local pipeline uses Python 3.12, [PyTorch 2.8.0 with CUDA 12.8](https://download.pytorch.org/whl/cu128), Blender 4.5 LTS, [TripoSR](https://github.com/VAST-AI-Research/TripoSR/tree/107cefdc244c39106fa830359024f6a2f1c78871), and the [matching checkpoint](https://huggingface.co/stabilityai/TripoSR/tree/5b521936b01fbe1890f6f9baed0254ab6351c04a). The first inference loads the public DINO ViT configuration. These commands use PowerShell and assume a Python virtual environment.

```powershell
python -m pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install omegaconf==2.3.0 transformers==4.51.3 trimesh==4.6.11 einops==0.8.1 scikit-image==0.25.2 imageio==2.37.0

$pipeline = 'tools/cartridge-pipeline'
python "$pipeline/reconstruct.py" 'masters/zonk-front.png' 'build/zonk/zonk-dense.glb' --resolution 256 --neutral-background --source 'local/TripoSR' --weights 'local/weights'
python "$pipeline/reference_mask.py" 'masters/zonk-turnaround.png' 'build/zonk/zonk-rear.projection.png' --crop-left .162 --threshold 26
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/finish-zonk.py" -- 'build/zonk'

python "$pipeline/reconstruct.py" 'masters/undergrowth-front.png' 'build/undergrowth/undergrowth-dense.glb' --resolution 256 --neutral-background --source 'local/TripoSR' --weights 'local/weights'
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/finish-undergrowth.py" -- 'build/undergrowth'
```

Create the build folders first. `reconstruct.py` writes the dense GLB and the cropped RGBA projection alongside it. Put `zonk-sticker.jpg` beside the dense ZONK file before finishing. For Undergrowth, the optional `resin-normal.png` adds fine wear. The finishing scripts save the Blender project and browser GLB together.

- **ZONK.** Keep the generated shape, clean the label well, and simplify the shell. Bake the front and rear references to the shell UV, blending to generated color around the sides. The label is a separate rounded mesh. The fitting helper samples the shell underneath, adds a small dome, and applies a packed paper texture.
- **Undergrowth.** Keep the generated outline, mirror it, and adjust its thickness against the side view. Emboss wing ribs in the front and rear of the same casting. Open its foot and offset the inner wall. Fit the internal board inside the shell and extend that very same board out through the foot. The copper and gold fingers sit on the board, with rear trace layout guided by the back view. Use real glTF transmission and check it over a dark display background.

TripoSR uses the **front image only**. Use the other views for geometry checks and texture projections. The Blender finishing scripts for these two carts are concrete examples. Adjust the crop, measurements, and fit for a new shape.

### Undergrowth amber material pass

Reconstruct a front reference of the **empty casing** as `empty-shell.glb` in a separate build folder. Keep the previous Undergrowth `.blend` as the board source. Put the optional `undergrowth-wordmark.jpg` and `resin-normal.png` beside the new shell.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/finish-amber-shell.py" -- 'build/undergrowth/undergrowth-advance.blend' 'build/amber'
```

The script samples the reconstructed exterior to make a depth map. It uses that map for the inner wall offset and for the GLB's volume thickness. Distance-dependent absorption and a transmission map make the thin areas clearer and the ribs and rim more orange. Reference wear contributes to the roughness map. The amber edge guard surrounds the exposed PCB on three sides, leaving the contact faces available. The browser uses [glTF transmission and absorption](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume).

### Direct reconstruction and reference bake

Use `--resolution 352` in `reconstruct.py` to reproduce the direct Undergrowth pass. Keep `empty-shell.glb` and `empty-shell.projection.png` together with the wordmark in the output folder. Then run `bake-undergrowth-reference.py`, giving it the amber-pass Blender file and the new output folder.

This pass keeps the generated eyespots, antennae, and thorax geometry. Register the entire shell to the PCB, trim the contact foot, and reduce the tessellation. Bake the source photograph directly onto the front UVs and blend to generated vertex color around the sides. The photo makes the fine ridges and scratches legible. Its color also drives the three optical maps, including clearer, smoother windows and more solid orange structural details.

### Specimen Run and other opaque shells

Use matched front, left, rear, and right elevations when the shape wraps around the cartridge. Specimen Run was rebuilt with all four images conditioning one mesh. The geometry generator is [Hunyuan3D-2mv](https://huggingface.co/tencent/Hunyuan3D-2mv), using the [official code revision](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/tree/f8db63096c8282cb27354314d896feba5ba6ff8a) and the `hunyuan3d-dit-v2-mv-turbo` weights under [this model revision](https://huggingface.co/tencent/Hunyuan3D-2mv/tree/3a761b539b29fe4ff64714813aa9560fd66f5de0). Place `config.yaml` and `model.fp16.safetensors` together. The model is used locally to generate geometry and the browser serves the resulting GLB. See the [model license](https://huggingface.co/tencent/Hunyuan3D-2mv/blob/main/LICENSE) for terms.

Use the Python dependencies from above and matching `torchvision==0.23.0` from the CUDA 12.8 PyTorch index. The Windows run also used `diffusers==0.35.2`, `accelerate==1.10.1`, `pymeshlab==2025.7`, and `opencv-python-headless==4.12.0.88`.

```powershell
python "$pipeline/reconstruct-multiview.py" 'build/specimen-run/hunyuan-multiview.glb' --source 'local/Hunyuan3D-2' --weights 'local/hunyuan-mv-weights' --front 'masters/specimen-front.png' --left 'masters/specimen-left.png' --back 'masters/specimen-rear.png' --right 'masters/specimen-right.png'
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/specimen-run' 'gut-punch-specimen-run' --native-gltf --shell-depth .089 --label-width .222 --label-height .109 --label-y -.015
```

Put the full-bleed print in `label.jpg` before running Blender. The reconstruction script also writes `shell-dense.glb` for the largest connected component and the four cropped projections consumed by the baker. It retains larger gaps between the tendrils. The 352-resolution run peaked at 5.42 GiB of allocated CUDA memory on the RTX 5070. Check the untextured shell edge-on and at rear three-quarter before baking the art. The bake projects all four images and exports the atlas on UV0. The printed label remains a separate mesh.

For a one-image TripoSR build, run `reconstruct.py` on the front and use the same Blender baker with its default input axes. Add `--keep-holes` when segmenting a front with enclosed negative space.

## Fit and publish

- Blender coordinates use **+Z up and −Y forward**. Export GLB with **+Y up** so the runtime sees +Y up and +Z forward. Keep the connector centered at X = 0. The tongue reaches Y ≈ −0.143 in the GLB. Use a tongue at most 0.316 wide and 0.062 deep at the mating end. Keep wide shoulders above the slot rails. The arcade positions the model at the shared handheld seat.
- Inspect the front, side, and back at phone width as well as on desktop. For a translucent shell, check that the circuit board is readable through the plastic and that the contact fingers enter the slot with it. Check the label at shelf size and close up.
- Place the GLB under `arcade/art/` and set the game's `cartridgeModel` in `catalog.json`. The shelf and museum share that file. When the flat `cartLabel` already prints the game's title, set `cartLabelIncludesTitle` to `true` to suppress the extra CSS title.
- Verify **Turn over** in the shelf carousel, inventory or pedestal inspection, and insertion into the handheld. Try launching the ROM and lowering the handheld to return to the same place.
