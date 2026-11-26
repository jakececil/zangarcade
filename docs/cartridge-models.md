# Making cartridges for ZANG Arcade

**The standard for new cartridges is six matched orthographic references and Hunyuan3D-2mv reconstruction.** Specimen Run established the multiview geometry workflow. Lower Management added the top reference and separate material zones. Swamp Rocket adds the underside and a cloudy refractive casting. All cartridges share the handheld connector coordinates.

## ZANG Field Player

Use the same four-view Hunyuan3D-2mv reconstruction with front, left, rear, and right references. Supply the matching top and underside for the texture projections. The field player’s imagegen reference sheet depicts a charcoal field recorder with a worn skull sticker, yellow hazard tape, an empty top cartridge port, and a 3:2 screen recess. Crop each view individually and use `--solid-silhouette --resolution 320 --steps 12`.

```powershell
blender -b --factory-startup --python-exit-code 1 --python tools/cartridge-pipeline/bake-field-player.py -- build/zang-field-player
```

The bake decimates the generated shell, applies the projection atlas and roughness/metallic zones, then cuts the display aperture and cartridge port. It exports an editable `zang-field-player.blend` and an optimized GLB. Publish the GLB to `arcade/art/zang-field-player.glb`. The runtime and model share an aperture of 1.44 × 0.96 centered at Y-up 0.08. Check the insertion animation and browser viewport alignment after editing the bezel.

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

For a revised top or underside image, rerun the command against the existing raw GLB with `--projections-only` and the six reference paths. It refreshes the texture projections and their hashes without running Hunyuan again. The four conditioning images must still match the reconstruction.

Bake the reference colors into the shell atlas, fit the contact end, and keep the source mesh and projection UVs in Blender. The runtime exports the atlas on UV0. Lower Management uses a packed glTF roughness/metallic texture. The contacts and brass claw use a high metallic response. Plastic, bone, rubber, and the separate print use different roughness values. The carousel supplies a soft reflection environment for models with a metallic map. Rotate the result to check that these differences survive the bake.

### Tile lettering and compacted scrap

Landfill's six shell references leave a clear face for the title. The shell is reconstructed from the four horizontal views. The bake projects all six references and gives bare steel, painted enamel, and connector plating different finishes. The title tiles fit directly to the recovered front surface as shallow solid pieces with bevels and cast shadows.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/landfill' 'landfill' --native-gltf --shell-width .512 --shell-height .313 --shell-depth .083 --label-width .305 --label-y -.041 --compacted-scrap --tile-title LANDFILL
```

### Cloudy refractive resin

The Swamp Rocket bake casts inward rays through the recovered mesh and puts the measured optical paths on the UV atlas. The browser uses that map for depth-dependent absorption and refraction at IOR 1.47. Mottled transmission, roughness, and pigment flecks give the cloudy regions a softer response. Set `--resin-haze` from 0 to 1 to tune that finish across the whole casting. The Blender master adds a volume-scatter shader for Cycles. The carousel lights the resin from the same dark display backdrop used by the rest of the collection. [glTF volume extension](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume)

### Reusable edge-card PCB

Start with six matching views of the bare PCB. Match the contact row on the front, rear, and underside. Give at least one side clear traces and components so they read through tinted resin. Reconstruct the board with `reconstruct-multiview.py`, as above, using `build/zang-pcb/hunyuan-multiview.glb` as the output. Then bake the separate mesh using the same reference projector as the shell.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-pcb.py" -- 'build/zang-pcb'
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/swamp-rocket' 'swamp-rocket' --native-gltf --shell-width .508 --shell-height .289 --shell-depth .074 --label-width .205 --label-height .092 --label-x -.022 --label-y -.015 --refractive-resin --resin-haze .28 --pcb 'build/zang-pcb/zang-pcb.glb'
```

`zang-pcb.blend` keeps the reference projectors. The standalone `zang-pcb.glb` is aligned to the shared connector with its tongue bottom at Y = −0.143, centered on X. It has a baked color atlas and a packed roughness/metallic atlas for the copper and gold. The front gold pads have a higher metallic response and a smoother finish than the laminate between them. Check how the board sits inside each new shell. The PCB bake's `--width`, `--height`, and `--depth` options can adapt it to the available space while preserving the connector datum.

When baking a translucent shell, `--pcb` seats this mesh against a molded plastic backing and recesses the front contacts between the resin rails. The rear shell covers the tongue. Use `--pcb-window-top` to align the opening to the pin shoulder. The exterior resin keeps the same finish over the routed board and the surrounding casting. Inspect the front contacts, the covered rear edge, and the insertion fit. Publish the combined game GLB. Keep the standalone board and source in the authoring archive for the next shell.

The PCB assembly exports a `cartridgeShadow` role on its opaque parts. The printed laminate casts, the board receives, and the saddle does both. The shelf and museum inspection use a small filtered shadow map and a lower fill light for models with these roles. The transparent casting reveals the lit interior through refraction. Rotate the cartridge under the fixed key light to check the moving label shadow.

### Gilt instruments and creek stone

Reconstruct and project the six views as above. Cat’s Cradle uses raised brass thread pegs, a dark enamel plate, and a thin, fitted title transfer in its recessed well. Riverbed uses two different finishes for moss and the wet creek channel. Fit the lettering from `label.png` with `--ink-title` to reveal the stone beneath the gaps in the title.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/cats-cradle' 'cats-cradle' --native-gltf --shell-width .405 --shell-height .405 --shell-depth .077 --label-width .207 --label-height .051 --label-y -.013 --artifact-material gilt-enamel
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/riverbed' 'riverbed' --native-gltf --shell-width .529 --shell-height .242 --shell-depth .089 --label-width .241 --label-height .071 --label-x -.022 --label-y -.084 --artifact-material creek-stone --ink-title
```

### Aquarium enamel and gummy machinery

Kingfisher's base housing pairs vitreous blue highlights with worn brass and coral. The aquarium assembly seats a curved clear pane in the brass rim and recesses a small scene with three separately reconstructed fish, modelled kelp and gravel, and a habitat backing. Triple Giblet uses a slicker finish on the hot pink shell and chartreuse spring, with satin mint plates and a dark rubber face. Its two-color title is cut out from `label.png` to follow the recess.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/kingfisher' 'kingfisher' --native-gltf --shell-width .515 --shell-height .316 --shell-depth .102 --label-width .207 --label-height .050 --label-y -.067 --artifact-material aquarium-enamel
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/triple-giblet' 'triple-giblet' --native-gltf --shell-width .463 --shell-height .386 --shell-depth .090 --label-width .234 --label-height .078 --label-x .014 --label-y -.005 --artifact-material gummy-machine --ink-title
```

Keep the aquarium's fitted shell input as `build/kingfisher-housing.blend`. The fish source sheets have four orthographic views apiece. Split them into front, rear, left, and right reference images, then run `reconstruct-multiview.py` with those views at resolution 288. Put each baked `specimen.glb` below the corresponding `lure-fish`, `axolotl-fish`, or `moth-fish` subfolder in the assembly directory, with `habitat.jpg` and `label.jpg` at its root.

```powershell
blender -b --factory-startup --python-exit-code 1 --python "$pipeline/bake-aquarium-fish.py" -- 'build/lure-fish' 'lure-fish'
blender -b 'build/kingfisher-housing.blend' --python-exit-code 1 --python "$pipeline/assemble-kingfisher-aquarium.py" -- 'build/kingfisher'
```

The Blender master gives the dome an actual inner wall. The browser uses the curved outer mesh, glTF thickness and IOR. The `cartridgeClearGlazing` flag keeps the transmitted image sharp while leaving the glass reflections and bend in place. Inspect both directions of rotation to verify that the fish sit inside the pane.

### Parasol optical assembly

Use the six-view luminous sunburst board for Parasol's clear outer rim, frosted face, champagne base, and rear photovoltaic array. Reconstruct the shell with the four horizontal views and keep the top and underside projections for the texture bake. The pale acrylic against the neutral studio background uses `--mask-threshold 15 --solid-silhouette` so transparent regions condition the model as solid material.

Run `assemble-parasol.py` with that build folder. The script traces the recovered outline and samples the sculpted front relief, then cuts the reconstructed casting to seat the optical assembly. It preserves the textured back and nameplate and fits the standard connector. The closed frosted face, polished clear rim, flexible LED strip, and metal pins export as separate materials. Transmission shows the strip through the edge. An emissive texture approximates light scattered through the frosted acrylic, and three short-range point lights spill onto the hardware. Inspect front, profile, and rear before rendering the case preview.

The diffuser mounts slightly behind the nameplate plane sampled from the casting. It sits below the clear lip. Check that fit along the X axis in Blender's orthographic view.

### Blamball rebound equipment

Build the six-view reference around the ball, the diagonal rubber rail, and the rear half-court graphic. The four horizontal views condition the mesh. Bake all six views, keeping the case wordmark in the projected artwork.

```powershell
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/blamball' blamball --native-gltf --shell-width .490 --shell-height .354 --shell-depth .090 --artifact-material rebound-equipment --projected-title --contact-seam -.112
```

The material maps distinguish matte ball grain and rubber, glossier pink impact nylon, and exposed metal. The contact-edge assembly replaces the projected pads with 32 plated contacts, a recessed board, and an insulated back. The rest of the case retains the reconstructed surface.

### Garden Song molded playset and Jumbo Mini Golf turf

Use the matching six views from each set. Garden Song retains the molded seams in the generated relief and assigns separate plastic finishes to the colored areas. Jumbo uses the thin edge reference pair for its top and underside projections. The turf pass samples the baked green areas of the reconstructed shell and grows bent, two-sided mesh fibers with darker roots and lighter tips. This puts fibers on the front, edges and rear without planting the lettering, cup, cork or contacts.

```powershell
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/garden-song' garden-song --native-gltf --shell-width .450 --shell-height .424 --shell-depth .121 --artifact-material molded-playset --projected-title --contact-seam -.116 --cartridge-shadows
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/jumbo-mini-golf' jumbo-mini-golf --native-gltf --shell-width .511 --shell-height .360 --shell-depth .127 --artifact-material tufted-course --projected-title --contact-seam -.105
```

Both export self-shadowing roles for the rotating shelf and museum inspection. Jumbo's fiber vertex colors export with the geometry. Check that the pile casts onto the green and catches the rim light under rotation.

### Cosmic Jumbo and Lighthouse Keeper

The cosmic Jumbo uses a fresh reconstruction of the Earth-ball relief and loop track. Keep the small badge as a separate label fitted inside the dedicated recess. Lighthouse Keeper preserves the sculpted foam, tower and lantern relief on the front, with a sea-chart back.

The finish pass reads `relief.json` in the build folder. Set Jumbo's `center` and `radius` as normalized front-view coordinates for the black-hole well. Set Lighthouse Keeper's `lantern`, `beam_end`, and `beam_width` in the same coordinate system. The origin is the lower left. The masks use the front projection and face normals, so the lit contours stay on the front through a full turn. A roughness and specular map soften reflections progressively inside the well. The corona and beam use emissive textures.

```powershell
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/jumbo-cosmic' jumbo-mini-golf --native-gltf --shell-width .473 --shell-height .429 --shell-depth .124 --artifact-material cosmic-loop --label-width .148 --label-height .031 --label-y -.082 --contact-seam -.112 --cartridge-shadows
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/lighthouse-keeper' lighthouse-keeper --native-gltf --shell-width .410 --shell-height .460 --shell-depth .108 --artifact-material coastal-relief --projected-title --contact-seam -.124 --cartridge-shadows
```

Open that Lighthouse Keeper Blender master with `refit-lighthouse-badge.py` and pass an output folder and a bold serif font path after `--`. The script cleans the old title field, fits the back of the oval to the shell and raises the two lines of type from a planar enamel face. The plate and text export as separate meshes.

### The Weather Engine and Little Company

Use each game's six matched orthographic views. Weather Engine reuses the turf blade builder with shorter flock fibers restricted to the pale cloud surfaces. Brass hardware gets its own metallic finish in the material map. Little Company's water cap is a closed section cut from the reconstructed silhouette, with clear transmission up top and more haze beside the sand. The cast cap has separately modeled fragments. Below it the opaque surface moves from city enamel through rough soil to a low magenta glow in the deepest strata.

```powershell
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/the-weather-engine' the-weather-engine --native-gltf --shell-width .502 --shell-height .402 --shell-depth .118 --artifact-material flocked-brass --projected-title --contact-seam -.110
blender -b --python-exit-code 1 --python "$pipeline/bake-opaque-cartridge.py" -- 'build/little-company' little-company --native-gltf --shell-width .469 --shell-height .410 --shell-depth .098 --artifact-material stratified-world --waterline .749 --projected-title --contact-seam -.117 --cartridge-shadows
```

### Case and slot previews

Render previews from the finished GLBs. The renderer centers the connector, and the WebP packer preserves that horizontal center when it crops the transparent margins. Add the result as `cartridgePreview` in the catalog. The shelf uses it in the open case, during insertion and ejection, and in the player’s cartridge UI. The carousel and museum use `cartridgeModel` for interactive 3D. Regenerate the WebP after a model revision and version its URL if replacing an existing public file.

### Lower Management hex drum

The Specimen Cabinet in v2 supplied six matching head, body, and leg sets. The two print masters have three columns of specimens and three rows of body parts. Keep the neck and waist joins centered in each column. Side 0 defaults to Rabbit/Puddle, followed around the drum by Jelly/Shroud, Stress/Knuckle, Wisp/Buddress, Granite/Coil, and the human/Webwalker.

```powershell
python "$pipeline/pack-lower-management-drum.py" 'build/lower-management-drum' 'art/covers/gut-punch-lower-management.webp'
blender -b --python-exit-code 1 --python "$pipeline/build-lower-management-drum.py" -- 'build/lower-management-drum'
```

Store the source sheets as `print-1.png` and `print-2.png` in that build folder. The Blender script builds concentric six-face bands around a fixed axle and packs the texture atlas. Keep the rotation pivots as separate nodes with glTF extras `cartridgeDrumBand` set to 0, 1, and 2 from top to bottom. Each band turns 60° at a time in the shelf viewer and museum inspection. The fixed housing tapers into a keyed connector with 32 front pads and insulated rear support. Use the preview renderer below for the case and handheld transitions.

```powershell
blender -b --python-exit-code 1 --python "$pipeline/render-cartridge-previews.py" -- 'build/previews' 'build/kingfisher/kingfisher.glb' 'build/triple-giblet/triple-giblet.glb'
python "$pipeline/pack-cartridge-previews.py" 'art/cartridges' 'build/previews/kingfisher.png' 'build/previews/triple-giblet.png'
```

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

### Candy reels and salvaged pinball hardware

Sugar Drum uses the six-view reconstructed candy shell and a separate six-symbol strip named `reel-symbols.jpg`. Run the opaque baker with `--artifact-material candy-mechanism --projected-title --contact-seam -.110 --shell-width .492 --shell-height .415 --shell-depth .123`. The Blender pass removes the molded lever, recesses three windows, and adds the real reel and lever pivots with the embedded lamp lenses. `sugar_drum_detail.py` traces the glyphs against the cropped front projection, samples the depth beneath each glyph, and adds beveled caps with real counters. The three faceted jewels have fitted brass seats. The glTF extras `sugarReel` (indices 0–2), `sugarLever`, and `sugarLamp` bind those parts to `arcade/cartridge-slots.js` in the shelf viewer and museum inspection. Each pull selects a face independently for each reel. All three matching lights the lenses. The reduced-motion setting resolves the spin without continuous movement.

Trashland Pinball uses `--artifact-material pinball-salvage --projected-title --contact-seam -.111 --shell-width .462 --shell-height .468 --shell-depth .101 --cartridge-shadows`. Keep the short connector taper below the cream sign. The finish map separates scuffed plastic and exposed metal, and the steel ball in the keeper pocket is a separate polished mesh.

## Fit and publish

- Blender coordinates use **+Z up and −Y forward**. Export GLB with **+Y up** so the runtime sees +Y up and +Z forward. Keep the connector centered at X = 0. The tongue reaches Y ≈ −0.143 in the GLB. Use a tongue at most 0.316 wide and 0.062 deep at the mating end. Keep wide shoulders above the slot rails. The arcade positions the model at the shared handheld seat.
- Inspect the front, side, and back at phone width as well as on desktop. For a translucent shell, check that the circuit board is readable through the plastic and that the contact fingers enter the slot with it. Check the label at shelf size and close up.
- Place the GLB under `arcade/art/` and set the game's `cartridgeModel` in `catalog.json`. The shelf and museum share that file. Add `?v=<first 12 characters of the GLB's SHA-256>` and update it with each replacement so returning visitors request the new model. When the flat `cartLabel` already prints the game's title, set `cartLabelIncludesTitle` to `true` to suppress the extra CSS title.
- Verify **Turn over** in the shelf carousel, inventory or pedestal inspection, and insertion into the handheld. Try launching the ROM and lowering the handheld to return to the same place.

## Full-size museum props

The Gutter Cabinet uses the same Hunyuan3D-2mv step with six cabinet views. Run `blender -b --factory-startup --python-exit-code 1 --python tools/cartridge-pipeline/bake-museum-cabinet.py -- build/gutter-cabinet` against the reconstruction directory. This pass scales the cabinet to 1.94 m, puts its origin on the floor, and exports a 62,000-triangle shell with baked textures for cast metal, CRT glass, fungal buildup, and the emissive marquee. Publish the GLB under `arcade/art/` and update the URL in `arcade/cabinet-alcove.js`.

The corridor reuses the model placed in the living room. The surrounding panels share one warped mesh and the `cast-charcoal.webp` UV texture. Mount the panel instances against the wall and set their light separately from the cabinet so the prop can also stand on its own. The hallway floor and ceiling clearances still come from the room layout.

Cabinet V2 removes the red projection spill at control-deck height across the shell atlas. `cabinet_details.py` planes a recess in the donor casting and seats a beveled graphite plate. The nickel shaft, phenolic balltop, four nylon buttons, and their gaskets are separate pieces with independent finishes. Nine bracket caps raycast their attachment points against the left shell. Their closed surfaces include concentric cap bands and pore undersides. Inspect the front and rear at a three-quarter angle before export.
