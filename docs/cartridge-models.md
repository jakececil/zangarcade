# Making cartridges for ZANG Arcade

**The standard for new cartridges is six matched orthographic references and Hunyuan3D-2mv reconstruction.** Specimen Run established the multiview geometry workflow. Lower Management added the top reference and separate material zones. Swamp Rocket adds the underside and a cloudy refractive casting. All cartridges share the handheld connector coordinates.

## Art masters

1. Generate a **straight-on front** with the whole shell isolated on a neutral background. Give it a centered contact tongue and a well for a separate label. Lock the design before making the other views.
2. Make the **rear, left, and right** from that front reference. The rear reverses the front's handedness. The sides show the profile, the connector depth, and how the details wrap around the body. Keep the same casing, pose, contact line, and scale across the set.
3. Make a **top** elevation with the label side toward the bottom of the image. Make an **underside** elevation with the label side toward the top. Check front-to-back depth, the connector opening, and where the contact board meets the shell. Bake both edges from their matching views.
4. Generate the print separately using the game's box art. Fit it to the measured well and keep it on its own mesh.

Keep full-resolution references, dense GLBs, raw textures, and Blender files outside the Pages folder. Bring only the optimized GLB and the optional flat WebP print into the site.

## Standard multiview build

[Hunyuan3D-2mv](https://huggingface.co/tencent/Hunyuan3D-2mv) jointly conditions one mesh on the front, left, rear, and right. Use the top and underside for the Blender bake and fit check. Use [code revision f8db630](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/tree/f8db63096c8282cb27354314d896feba5ba6ff8a) and the `hunyuan3d-dit-v2-mv-turbo` weights under [model revision 3a761b5](https://huggingface.co/tencent/Hunyuan3D-2mv/tree/3a761b539b29fe4ff64714813aa9560fd66f5de0). Place `config.yaml` and `model.fp16.safetensors` together. The browser receives the resulting GLB. [Model license](https://huggingface.co/tencent/Hunyuan3D-2mv/blob/main/LICENSE)

These commands use Python 3.12, a Python virtual environment, [PyTorch 2.8.0 with CUDA 12.8](https://download.pytorch.org/whl/cu128), and Blender 4.5 LTS. Put the fitted print in `build/swamp-rocket/label.jpg`.

```powershell
python -m pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install omegaconf==2.3.0 transformers==4.51.3 trimesh==4.6.11 einops==0.8.1 scikit-image==0.25.2 imageio==2.37.0 diffusers==0.35.2 accelerate==1.10.1 pymeshlab==2025.7 opencv-python-headless==4.12.0.88
$pipeline = 'tools/cartridge-pipeline'
python "$pipeline/reconstruct-multiview.py" 'build/swamp-rocket/hunyuan-multiview.glb' --source 'local/Hunyuan3D-2' --weights 'local/hunyuan-mv-weights' --front 'masters/swamp-rocket-cartridge-front.png' --left 'masters/swamp-rocket-cartridge-left.png' --back 'masters/swamp-rocket-cartridge-back.png' --right 'masters/swamp-rocket-cartridge-right.png' --top 'masters/swamp-rocket-cartridge-top.png' --bottom 'masters/swamp-rocket-cartridge-bottom.png'
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/swamp-rocket' 'swamp-rocket' --native-gltf --shell-width .508 --shell-height .289 --shell-depth .074 --label-width .205 --label-height .092 --label-x -.022 --label-y -.015 --refractive-resin
```

The reconstruction writes the raw GLB, the largest connected shell as `shell-dense.glb`, all six cropped projections, and a manifest of the view hashes and inference settings. Inspect the untextured shell edge-on, from above and below, and at rear three-quarter. Then measure the label well and use the top and sides to set `--shell-depth`. Older five-view builds can omit `--bottom`.

Bake the reference colors into the shell atlas, fit the contact end, and keep the source mesh and projection UVs in Blender. The runtime exports the atlas on UV0. Lower Management uses a packed glTF roughness/metallic texture. The contacts and brass claw use a high metallic response. Plastic, bone, rubber, and the separate print use different roughness values. The carousel supplies a soft reflection environment for models with a metallic map. Rotate the result to check that these differences survive the bake.

### Cloudy refractive resin

The Swamp Rocket bake casts inward rays through the recovered mesh and puts the measured optical paths on the UV atlas. The browser uses that map for depth-dependent absorption and refraction at IOR 1.47. Mottled transmission, roughness, and pigment flecks give the cloudy regions a softer response. The Blender master adds a volume-scatter shader for Cycles. The carousel uses a dark backlit panel for tagged models so you can see what the clear edges do as you rotate them. [glTF volume extension](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume)

### Reusable edge-card PCB

Start with six matching views of the bare PCB. Match the contact row on the front, rear, and underside. Give at least one side clear traces and components so they read through tinted resin. Reconstruct the board with `reconstruct-multiview.py`, as above, using `build/zang-pcb/hunyuan-multiview.glb` as the output. Then bake the separate mesh using the same reference projector as the shell.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-pcb.py" -- 'build/zang-pcb'
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/swamp-rocket' 'swamp-rocket' --native-gltf --shell-width .508 --shell-height .289 --shell-depth .074 --label-width .205 --label-height .092 --label-x -.022 --label-y -.015 --refractive-resin --pcb 'build/zang-pcb/zang-pcb.glb'
```

`zang-pcb.blend` keeps the reference projectors. The standalone `zang-pcb.glb` is aligned to the shared connector with its tongue bottom at Y = −0.143, centered on X. It has a baked color atlas and a separate packed roughness/metallic atlas for the warm copper and gold. The tongue is plated on the front. Check how the board sits inside each new shell. The PCB bake's `--width`, `--height`, and `--depth` options can adapt it to the available space while preserving the connector datum.

When baking a translucent shell, `--pcb` seats this mesh against a molded plastic backing and recesses the front contacts between the resin rails. The rear shell covers the tongue. Use `--pcb-window-top` to align the opening to the pin shoulder. The exterior resin keeps the same finish over the routed board and the surrounding casting. Inspect the front contacts, the covered rear edge, and the insertion fit. Publish the combined game GLB. Keep the standalone board and source in the authoring archive for the next shell.

## Earlier builds and material studies

The earlier ZONK and Undergrowth builds use [TripoSR](https://github.com/VAST-AI-Research/TripoSR/tree/107cefdc244c39106fa830359024f6a2f1c78871) and its [matching checkpoint](https://huggingface.co/stabilityai/TripoSR/tree/5b521936b01fbe1890f6f9baed0254ab6351c04a). Their first inference loads the public DINO ViT configuration.

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

## Fit and publish

- Blender coordinates use **+Z up and −Y forward**. Export GLB with **+Y up** so the runtime sees +Y up and +Z forward. Keep the connector centered at X = 0. The tongue reaches Y ≈ −0.143 in the GLB. Use a tongue at most 0.316 wide and 0.062 deep at the mating end. Keep wide shoulders above the slot rails. The arcade positions the model at the shared handheld seat.
- Inspect the front, side, and back at phone width as well as on desktop. For a translucent shell, check that the circuit board is readable through the plastic and that the contact fingers enter the slot with it. Check the label at shelf size and close up.
- Place the GLB under `arcade/art/` and set the game's `cartridgeModel` in `catalog.json`. The shelf and museum share that file. When the flat `cartLabel` already prints the game's title, set `cartLabelIncludesTitle` to `true` to suppress the extra CSS title.
- Verify **Turn over** in the shelf carousel, inventory or pedestal inspection, and insertion into the handheld. Try launching the ROM and lowering the handheld to return to the same place.
