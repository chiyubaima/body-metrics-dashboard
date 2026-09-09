# Captain 彩色网页版本提示词（2026-09-09）

仅使用内置 ImageGen 编辑原六行灰色动作。目标图先按原 alpha 叠到纯洋红底色，以便确定性恢复透明边缘；后四行同时附加已着色 idle 第一帧作为配色参考。尺寸登记恢复原 192×208 帧格，静态头像使用原裁切 `idle[0].crop((24,0,168,144)).resize((256,256))`。manifest 和旧灰色 v2 包未改动。

直接头像着色候选因身份/裁切变化被放弃；最终头像来自已通过的彩色 idle。休息行第一次请求未输出图像，随后以相同完整着装原图进行一次简化着色重试成功。

## idle

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain idle animation strip. Image 1 is the exact edit target on a removable flat magenta background with 6 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 6 complete full-body frames, the same hands-on-hips breathing and blink cycle. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 1152×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## greeting

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain greeting animation strip. Image 1 is the exact edit target on a removable flat magenta background with 4 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 4 complete full-body frames, the same raise-hand, wave and lower-hand sequence. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 768×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## thinking

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain thinking animation strip. Image 1 is the exact edit target on a removable flat magenta background with 6 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 6 complete full-body frames, the same hand-to-chin thinking expressions and head/eye changes. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 1152×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## fitness

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain fitness animation strip. Image 1 is the exact edit target on a removable flat magenta background with 6 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 6 complete full-body frames, the same two-dumbbell curl cycle with both weights continuously held. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 1152×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## eating

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain eating animation strip. Image 1 is the exact edit target on a removable flat magenta background with 6 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 6 complete full-body frames, the same supported bowl and spoon-to-mouth eating cycle. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 1152×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## rest

STRICT IN-PLACE COLORIZATION. Do not redesign, reframe or change facial proportions. Preserve each existing outline and feature position.

COLOR-ONLY EDIT of the attached existing Captain rest animation strip. Image 1 is the exact edit target on a removable flat magenta background with 6 existing frames; preserve every original pose and outline in Image 1. If a colored reference is attached, use it for color ONLY, never replace the target poses with reference poses.

Return the same single horizontal row of exactly 6 complete full-body frames, the same shorter seated cross-legged breathing and eyelid sequence. Keep the existing original character identity, face construction, hair sculpt, body proportions, all limb and prop placements, each expression, order and action timing, head/body scale, silhouette, feet or seated baseline and generous transparent padding. No rearranging, resampling into a different pose sequence, adding/removing frames, duplicating poses, swapping props or changing the camera. Preserve the original 1152×208 aspect ratio and pixel layout; output may be higher resolution in the same ratio if necessary, but keep exactly the same composition.

Color map consistent in EVERY frame: deep navy athletic suit (#243D60); off-white star (#F6F5ED) and pale cool-gray seams; red gloves (#C64843); white/light-gray sneakers with NAVY side sections and restrained RED toe/heel accents; natural warm peach skin (#E5AD7F), dark brown-black hair (#272120), deep brown irises and white sclera. Preserve original 3D matte toy material, surface geometry, lighting and shading, now rendered with these colors. Never change colors between frames. Dumbbells remain charcoal/dark gray with subtle steel highlights. Food bowl stays white ceramic; food is natural cream/off-white with understated warm food color; spoon is gray metal. Do not color metal or food bright blue/red.

Keep the exact flat MAGENTA #FF00FF chroma backing in all negative space, unchanged; this deliberate backdrop will be removed deterministically. Do not make a black, white, gray, checkerboard or scenery background. Keep magenta out of the character, highlights and props. No floor, shadows, halos, glow, markings, letters, logos, motion marks or detached effects. Do not rotate, move or redraw a fixed sprite to fake motion. The only requested visual change is adding the specified colors to the existing animation frames.


## rest-retry

Recolor this exact existing sprite strip in place. It contains six frames of one fully dressed cartoon fitness companion sitting cross-legged. Keep the original six poses, original clothing, face, hair, body proportions, hands on knees, facial expressions, spacing and flat magenta background unchanged.

Add only these colors to existing surfaces: navy blue tracksuit, red gloves and small red sneaker accents, white star badge, natural warm face color, dark brown hair. Match the attached colored character reference for palette only. Preserve original lighting and 3D toy material. No new objects, effects, text, new poses or changes to framing. Return all six original frames in the same single horizontal row on flat #FF00FF.



---

# 初版灰色角色与旧 v2 图集生成记录

# Captain generation prompt set

Generated on 2026-09-09 with the built-in image generation tool. Original character artwork; no downloaded or third-party character image. Every final row generation used the canonical base plus its spacing-only layout guide.

## base-pet

Create one clean full-body reference sprite for Codex pet Captain.

Pet identity: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout..
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..


Place a single centered pose on a perfectly flat pure magenta #FF00FF chroma-key background. Keep the full pet visible, compact, readable at 192x208, and easy to animate. Preserve approved reference identity cues. No scenery, text, borders, checkerboard transparency, shadows, glows, detached effects, or extra props. Keep #FF00FF and close colors out of the pet, props, highlights, and effects.


## failed

Create one horizontal animation strip for Codex pet `captain`, state `failed`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 8 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 8 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Blocked/failed loop: slumped or deflated reaction with sad or closed eyes.

State requirements:
- Show failure through slumped pose, drooping ears/limbs, closed or sad eyes, and lower body position.
- Tears, small smoke puffs, or tiny stars are allowed only if attached to or overlapping the pet silhouette and kept inside the same frame slot.
- Do not draw red X marks, floating symbols, detached stars, separated smoke clouds, falling tear drops, dust, or other loose effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## idle

Create one horizontal animation strip for Codex pet `captain`, state `idle`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 6 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 6 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Calm low-distraction resting loop: subtle breathing, tiny blink, slight head/body bob, and only quiet persona-preserving motion.

State requirements:
- CRITICAL: idle is the low-distraction baseline state and the first frame is also used as the reduced-motion static pet.
- Use only subtle idle motion: gentle breathing, a tiny blink, a slight head or body bob, a very small material sway, or another quiet motion that fits the pet persona.
- Keep the pet essentially in the same pose, facing direction, silhouette, markings, palette, and prop state across all 6 frames.
- Idle variation must stay calm but still read as animation; do not repeat effectively identical copies across the loop.
- Do not show waving, walking, running, jumping, talking, working, reviewing, emotional reactions, large gestures, item interactions, or new props.
- Feet, base, body, or object anchor should remain planted or nearly planted.
- The first and last frames should be very close visually so the loop feels calm and does not pop.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## jumping

Create one horizontal animation strip for Codex pet `captain`, state `jumping`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 5 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 5 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Hover jump loop: anticipation, lift, airborne peak, descent, and settle through body height.

State requirements:
- Show the jump through pose and vertical body position only: anticipation, lift, airborne peak, descent, settle.
- Do not draw ground shadows, contact shadows, drop shadows, oval shadows, landing marks, dust, smears, bounce pads, or motion marks under the pet.
- Keep the background outside the pet perfectly flat chroma key with no darker key-colored patches.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## look-row-10

Create one horizontal look-direction strip for Codex pet `captain`, atlas row 10.

REPAIR PRIORITY: the previous complete row was rejected because cells 315 and 337.5 turned toward SCREEN-RIGHT. In this entire row, after the straight-down first cell, every remaining head/nose/pupil cue must stay on SCREEN-LEFT of center. The final three poses are LEFT-UP: 292.5 mostly LEFT with slight up; 315 visibly LEFT and UP equally; 337.5 mostly UP with a small but unmistakable LEFT turn. In cells 315 and 337.5 the nose tip and pupil centers must remain LEFT of the head center, never right. Smoothly ease from left toward centered-up, without crossing the centerline. Last 337.5 approaches the row-9 UP first cell from the LEFT side. Keep the same front-facing planted torso and same skull proportions. Generate the whole eight-pose row coherently, not individual patches.

Use the attached canonical base, completed standard contact sheet, layout guide, and approved four-cardinal strip for identity, scale, registration, spacing, direction semantics, and cross-row continuity. Read `qa/look-mechanics.md` and follow its pet-specific movement and eye/prop mechanics. The approved cardinal strip and completed coherent row 9 are authoritative. Use the cardinals for direction meaning and row 9 for cross-row identity, scale, registration, and continuity.

COHERENT SYNTHESIS LOCK: produce one unified eight-pose row. Do not paste, tile, or independently restyle individual cells. Every final cell must be drawn together with the same face construction, body proportions, line/render quality, lighting, materials, scale, baseline, and registration.

Output exactly 8 complete full-body frames in this exact left-to-right order: 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5. Degrees are clockwise: 000 is up, 090 right, 180 down, and 270 left. Neutral/front is not part of this row.

DIRECTION TARGETS — use these to shape the coherent row, not as pixel-level landmark gates:

1. `180`: vertical DOWN; no horizontal requirement.
2. `202.5`: horizontal SCREEN-LEFT and vertical DOWN.
3. `225`: horizontal SCREEN-LEFT and vertical DOWN.
4. `247.5`: horizontal SCREEN-LEFT and vertical DOWN.
5. `270`: horizontal SCREEN-LEFT; no vertical requirement.
6. `292.5`: horizontal SCREEN-LEFT and vertical UP.
7. `315`: horizontal SCREEN-LEFT and vertical UP.
8. `337.5`: horizontal SCREEN-LEFT and vertical UP.

Cardinals must be unmistakable. Intermediate poses should broadly occupy the intended quadrant and advance naturally through the ordered loop. Minor pupil, nose, eyelid, or aiming-feature deviations are acceptable when the overall direction, continuity, identity, and motion remain coherent. Do not deform the character merely to make every intermediate axis independently obvious.

SCREEN-COORDINATE LOCK: screen-left means the viewer's left image edge, never the character's own left. The row should travel naturally through the left half of the loop. Near-vertical 202.5 and 337.5 may have subtle horizontal cues; prioritize a coherent arc over exact pupil or nose placement.

HARD LAYOUT AND CONTINUITY CONTRACT — DETERMINISTIC REGISTRATION: draw exactly eight separated pose groups in left-to-right direction order. Keep enough chroma-only space between neighboring poses that each complete pose can be detected without cutting through foreground. Approximate the guide's equal spacing, but do not distort a pose merely to hit an exact source-canvas coordinate; deterministic assembly will crop the eight ordered groups, then apply one shared scale and baseline.

Use the same body height, head size, baseline, and planted-body position across the generated family. Never overlap neighboring poses, merge two poses into one connected group, crop foreground at the outer canvas edge, or resize one pose independently.

Keep the feet, base, or lower torso planted at the same coordinates across all eight frames. Express direction through the eyes, face, head, upper body, and physically appropriate prop movement, not by moving, rotating, or rescaling the entire sprite.

Place one centered pose in each invisible equal-width slot on flat pure magenta #FF00FF. Change only the natural parts needed to express gaze: eyes, eyelids, head, face, neck, upper body, appendages, and constrained prop follow-through. Keep identity, silhouette, materials, palette, markings, and props consistent.

ROW-BOUNDARY LOCK: 180 must continue directly from row 9's 157.5, matching its body size, baseline, planted anchor, expression, and construction. 337.5 must be one even 22.5-degree step before 000: nearly up-facing while remaining on the overall left-hand arc. Do not distort pupils, nose, or body geometry merely to exaggerate the subtle horizontal component.

PRE-RETURN CHECK: reject this result if it does not contain eight separated pose groups in the required order; neighboring poses overlap; foreground is cropped at the outer canvas edge; any frame changes sprite scale, body or head size, baseline, or planted-body position; the row visibly reverses into the wrong half of the loop; or 180 does not continue from 157.5 or 337.5 does not flow evenly into 000. Minor intermediate pupil or nose deviations are not rejection reasons. Exact cell cropping, resizing, and recentering happen deterministically after generation.

Do not rotate, skew, or tilt the whole sprite to fake gaze. Do not add replacement/googly eyes, labels, degree text, arrows, clocks, grids, shadows, glows, scenery, detached effects, or chroma-key colors inside the pet.


## look-row-9

Create one horizontal look-direction strip for Codex pet `captain`, atlas row 9.

Use the attached canonical base, completed standard contact sheet, layout guide, and approved four-cardinal strip for identity, scale, registration, spacing, direction semantics, and cross-row continuity. Read `qa/look-mechanics.md` and follow its pet-specific movement and eye/prop mechanics. The approved cardinal strip is authoritative for the up, screen-right, down, and screen-left pose families. Interpolate the intermediate directions as even 22.5-degree steps between those anchors.

COHERENT SYNTHESIS LOCK: produce one unified eight-pose row. Do not paste, tile, or independently restyle individual cells. Every final cell must be drawn together with the same face construction, body proportions, line/render quality, lighting, materials, scale, baseline, and registration.

Output exactly 8 complete full-body frames in this exact left-to-right order: 000, 022.5, 045, 067.5, 090, 112.5, 135, 157.5. Degrees are clockwise: 000 is up, 090 right, 180 down, and 270 left. Neutral/front is not part of this row.

DIRECTION TARGETS — use these to shape the coherent row, not as pixel-level landmark gates:

1. `000`: vertical UP; no horizontal requirement.
2. `022.5`: horizontal SCREEN-RIGHT and vertical UP.
3. `045`: horizontal SCREEN-RIGHT and vertical UP.
4. `067.5`: horizontal SCREEN-RIGHT and vertical UP.
5. `090`: horizontal SCREEN-RIGHT; no vertical requirement.
6. `112.5`: horizontal SCREEN-RIGHT and vertical DOWN.
7. `135`: horizontal SCREEN-RIGHT and vertical DOWN.
8. `157.5`: horizontal SCREEN-RIGHT and vertical DOWN.

Cardinals must be unmistakable. Intermediate poses should broadly occupy the intended quadrant and advance naturally through the ordered loop. Minor pupil, nose, eyelid, or aiming-feature deviations are acceptable when the overall direction, continuity, identity, and motion remain coherent. Do not deform the character merely to make every intermediate axis independently obvious.

SCREEN-COORDINATE LOCK: screen-right means the viewer's right image edge, never the character's own right. The row should travel naturally through the right half of the loop. Near-vertical 022.5 and 157.5 may have subtle horizontal cues; prioritize a coherent arc over exact pupil or nose placement.

HARD LAYOUT AND CONTINUITY CONTRACT — DETERMINISTIC REGISTRATION: draw exactly eight separated pose groups in left-to-right direction order. Keep enough chroma-only space between neighboring poses that each complete pose can be detected without cutting through foreground. Approximate the guide's equal spacing, but do not distort a pose merely to hit an exact source-canvas coordinate; deterministic assembly will crop the eight ordered groups, then apply one shared scale and baseline.

Use the same body height, head size, baseline, and planted-body position across the generated family. Never overlap neighboring poses, merge two poses into one connected group, crop foreground at the outer canvas edge, or resize one pose independently.

Keep the feet, base, or lower torso planted at the same coordinates across all eight frames. Express direction through the eyes, face, head, upper body, and physically appropriate prop movement, not by moving, rotating, or rescaling the entire sprite.

Place one centered pose in each invisible equal-width slot on flat pure magenta #FF00FF. Change only the natural parts needed to express gaze: eyes, eyelids, head, face, neck, upper body, appendages, and constrained prop follow-through. Keep identity, silhouette, materials, palette, markings, and props consistent.

ROW-BOUNDARY LOCK: 157.5 must be one even 22.5-degree step before 180. Match the approved 180 pose's body size, baseline, planted anchor, expression, and construction. Preserve the overall right-hand arc, but do not distort pupils, nose, or body geometry merely to exaggerate the subtle horizontal component.

PRE-RETURN CHECK: reject this result if it does not contain eight separated pose groups in the required order; neighboring poses overlap; foreground is cropped at the outer canvas edge; any frame changes sprite scale, body or head size, baseline, or planted-body position; the row visibly reverses into the wrong half of the loop; or 157.5 does not flow evenly into 180. Minor intermediate pupil or nose deviations are not rejection reasons. Exact cell cropping, resizing, and recentering happen deterministically after generation.

Do not rotate, skew, or tilt the whole sprite to fake gaze. Do not add replacement/googly eyes, labels, degree text, arrows, clocks, grids, shadows, glows, scenery, detached effects, or chroma-key colors inside the pet.


## review

Create one horizontal animation strip for Codex pet `captain`, state `review`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 6 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 6 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Ready-review loop: focused inspection of completed output with lean, blink, narrowed eyes, head tilt, or paw pose.

State requirements:
- Show review through lean, blink, narrowed eyes, head tilt, or paw/hand position.
- Do not add magnifying glasses, papers, code, UI, punctuation, symbols, or other new props unless they already exist in the base pet identity.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## running-left

Create one horizontal animation strip for Codex pet `captain`, state `running-left`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 8 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 8 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Dragging-left loop: show directional movement to the left through body and limb poses only.

State requirements:
- Show directional drag movement to the left through body, limb, and prop movement only.
- The row must unmistakably face and travel left.
- The movement cadence must alternate visibly across the 8 frames instead of repeating one nearly static stride.
- Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## running-right

Create one horizontal animation strip for Codex pet `captain`, state `running-right`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 8 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 8 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Dragging-right loop: show directional movement to the right through body and limb poses only.

State requirements:
- Show directional drag movement to the right through body, limb, and prop movement only.
- The row must unmistakably face and travel right.
- The movement cadence must alternate visibly across the 8 frames instead of repeating one nearly static stride.
- Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## running

Create one horizontal animation strip for Codex pet `captain`, state `running`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 6 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 6 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Working loop: focused active-task processing, thinking, typing, scanning, or effortful concentration; not literal foot-running, jogging, sprinting, treadmill motion, raised knees, long steps, pumping arms, or directional travel.

State requirements:
- Show the pet actively working or processing, as if running a task: focused posture, busy hands or paws, purposeful bobbing, thinking motion, tool or prop motion only if already part of the pet identity, or other non-locomotion activity.
- Do not show literal foot-running, jogging, sprinting, treadmill motion, raised knees, long steps, pumping arms, directional travel, speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## waiting

Create one horizontal animation strip for Codex pet `captain`, state `waiting`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 6 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 6 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Needs-input loop: expectant asking pose for approval, help, or user input.

State requirements:
- Show that Codex needs approval, help, or user input through an expectant asking pose.
- Keep the motion patient and readable, without turning it into ordinary idle or review.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## waving

Create one horizontal animation strip for Codex pet `captain`, state `waving`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 4 full-body frames in one left-to-right row on flat pure magenta #FF00FF. Treat the row as 4 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Original cute athletic little human captain, compact whole body, large friendly warm-eyed face, short charcoal sculpted hair with one central soft quiff, fitted charcoal gray sports suit, a small simple light-gray star chest badge, gray gloves and rounded light-gray sneakers. Reliable leading-by-example personality. Black white gray only. No shield, no helmet, no mask, no Marvel replica, no text or logos. Symmetric outfit and no permanent held props. Compact relaxed athletic proportions, same face throughout.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `3d-toy`: Stylized 3D toy mascot with smooth rounded forms, simple materials, clear silhouette, and no photoreal complexity. User style notes: Polished monochrome soft 3D toy / chibi render, soft matte claylike vinyl, subtle grayscale highlights, bold simple readable features, full-body, friendly modest smile, visually clean and premium, no floor or shadow..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Greeting loop: paw or limb down, raised, tilted, and returning in a friendly attention gesture.

State requirements:
- Show the greeting through paw, hand, wing, or limb pose only.
- Do not draw wave marks, motion arcs, lines, sparkles, symbols, or floating effects around the gesture.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.


## fitness

Generate one horizontal six-frame animation strip of Captain doing a gentle standing two-dumbbell biceps curl. Attach canonical-base.png as strict identity reference and layout-guides/idle.png as spacing-only reference. Exactly six evenly spaced complete full-body poses in a single left-to-right row on perfectly flat pure magenta #FF00FF. No visible grid or labels.

Preserve the canonical original human chibi face, charcoal hair quiff, compact body, charcoal tracksuit, light star chest badge, gray gloves and rounded light sneakers; polished matte monochrome 3D toy. Use grayscale only in the character and props. Add two small clearly readable charcoal dumbbells, each continuously held by its respective hand, rounded rectangular plate ends.

Six-frame seamless cycle: 1 both arms lowered with elbows close to waist; 2 forearms halfway up; 3 dumbbells near shoulders, small satisfied smile; 4 hold near shoulders with slight exhale; 5 lower halfway; 6 nearly lowered again. Show real elbow/hand/dumbbell pose changes. Feet stay planted with stable height, body volume and baseline. Keep a calm leading-by-example demeanor without strain. All props touch hands. Enough padding for widest pose. No floor, shadow, scenery, motion marks, effects, text, floaters, blur or detached objects. Do not repeat the same pose or simulate motion by translating, scaling or rotating a fixed character.


## eating

Generate one horizontal six-frame animation strip of Captain enjoying a meal from a small white ceramic bowl with a gray spoon. Attach canonical-base.png as strict identity reference and layout-guides/idle.png as spacing-only reference. Exactly six evenly spaced complete full-body poses in a single left-to-right row on perfectly flat pure magenta #FF00FF. No visible grid or labels.

Preserve the canonical original human chibi face, charcoal hair quiff, compact body, charcoal tracksuit, light star chest badge, gray gloves and rounded light sneakers; polished matte monochrome 3D toy. Grayscale only. Bowl is continuously supported at chest/waist height by his left hand, the spoon continuously held by his right. Bowl contains simple sculpted grayscale rice or soft food, nothing floating.

Six-frame seamless cycle: 1 spoon touching bowl, friendly attentive face; 2 lifts spoon halfway toward mouth; 3 spoon arrives at mouth, tiny happy open mouth; 4 mouth closed contentedly, spoon starts moving down; 5 spoon descends toward bowl, eyes softly closed with happy chewing expression; 6 spoon returns into bowl, eyes open again. Keep feet planted, same scale and baseline. Clearly vary arms and expression, consistent hand/bowl relationship. All props remain attached to held hands. No floor, shadow, scenery, drips, crumbs, motion marks, effects, text, floaters or blur. Do not repeat the same pose or simulate motion by translating, scaling or rotating a fixed character.


## rest

Generate one horizontal six-frame animation strip of Captain resting peacefully while seated cross-legged. Attach canonical-base.png as strict identity reference and layout-guides/idle.png as spacing-only reference. Exactly six evenly spaced complete full-body poses in a single left-to-right row on perfectly flat pure magenta #FF00FF. No visible grid or labels.

Preserve the canonical original human chibi face, charcoal hair quiff, compact body, charcoal tracksuit, light star chest badge, gray gloves and rounded light sneakers; polished matte monochrome 3D toy. Grayscale only. Character sits cross-legged, hands resting naturally on knees, with no new prop or floor. Head stays the same scale as the base reference despite the shorter seated posture.

Six-frame seamless cycle: 1 eyes gently closed and relaxed shoulders; 2 quiet inhale, chest subtly rises; 3 shoulders and chin slightly raised on full breath; 4 slow exhale, chin returns; 5 softened shoulders and tiny restful smile; 6 settled pose nearly matching frame 1. Make calm visible breathing and eyelid variation, never six exact duplicates. Stable seated contact point, consistent anatomy and head proportions. No floor, shadow, scenery, sleep lettering, floating bubbles, effects, text, marks or blur. Do not translate, scale or rotate a fixed sprite to fake breathing.


## look-mechanics

# Captain look mechanics

Captain is a humanoid matte toy with a separate articulated head, brows, eyelids, nose and physical eyes. The torso, star badge, hands at hips and feet stay anchored and near front-facing. No new props. His head rotates naturally at the neck, never stretches or warps; eyes rotate in their sockets with eyelids and brows participating, and the head follows. Hair follows the skull rigidly; ears occlude naturally. Expression stays kindly attentive.

Viewer/screen directions define the four cardinal pose families. Up (000): chin and nose tip lift, visible lower nose/chin, upper eyelids open and eyes look clearly above the head, modest neck extension. Screen-right (090): head yaws about 30 degrees toward the image right, nose tip and pupil centers move right of head center, left cheek becomes more visible, far right-side facial edge/ear occludes. Down (180): chin tucks toward chest, nose and pupils aim below head center, upper hair surface becomes visible, eyelids lower; hands, chest badge and feet stay anchored. Screen-left (270): head yaws about 30 degrees toward the image left, nose tip and pupil centers move unmistakably left of head center, right cheek becomes more visible and opposite ear is hidden.

Motion budget: each 22.5-degree gaze step smoothly interpolates the adjacent cardinal head yaw/pitch and matching eye/eyelid/brow motion. No full-body rotation, tilt, zoom, skew or deformation. Head proportions and skull volume remain fixed. Neutral is a distinct straight-ahead face. The diagonal poses maintain both intended axes; cardinal direction cues should be strong enough to classify at normal 192×208 pet size. Body and hands remain in the same fixed placement, with only very restrained natural neck/upper-body follow-through. Row 9 follows up→right→down; row 10 follows down→left→up, matching row 9 scale and endpoints.
