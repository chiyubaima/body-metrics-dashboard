# Training type illustrations

## Directory contract

This directory contains only the three generated source PNGs and this provenance record. Filenames are resistance.png, cardio.png, and rest.png. These are the final application assets; keep this provenance record with them. Temporary staging copies in work/training-types/ are removed after integration.

## Generation

- Method: built-in image_gen tool.
- Date: 2026-09-08.
- Execution: exactly one call per type, one parallel batch of three calls; no variants, retries, or post-generation edits.
- Reference: web/public/strength-avatar/level-01.png, used as character and style reference only.
- Scope: an existing fictional male illustration in orange athletic clothes for a health dashboard. No private user data was included.

## Visual review

All three images show the same recognizable character, orange shirt, navy shorts, white shoes, white background, complete body, and clearly distinct requested action. All are 1254 × 1254 pixels. Rendering follows the reference's soft dimensional cartoon look. Shoes retain small blue accents in resistance/cardio; rest shoes have gray accents. The seated figure occupies a slightly wider silhouette, as expected from the pose. No text or UI elements are present.

## Source files and prompts

### resistance

- Local source: generated_images/01a080dd-f219-76f3-820e-519708380411/exec-efd6c6aa-0685-49e4-8084-f609614cb178.png
- Saved file: resistance.png

```text
Use case: illustration-story
Asset type: small training-type illustration for a health dashboard.
Input image: the attached image is a STYLE AND CHARACTER REFERENCE, not an edit target and not the requested pose. Preserve the same adult male character identity, dark brown swept hair, friendly face, dark eyes, warm skin tone, rounded facial features, and friendly approachable proportions.
Style/medium: polished soft rounded 2D digital illustration, clean shapes and smooth gentle shading, consistent with the reference's friendly character aesthetic.
Scene/backdrop: clean pure white background with only a subtle light-gray ground shadow.
Wardrobe: solid orange athletic training shirt, main orange #ff9600; navy shorts; white athletic shoes. No green clothing, no blue trim.
Composition/framing: exactly one full-body character centered in a square image. Keep the entire figure, shoes, and any necessary equipment visible. Compact readable silhouette with comfortable white margin on every side. The character should occupy about 80% of the canvas height. A single standalone scene, not a sheet, not a triptych, not a set.
Constraints: no text, letters, labels, UI, logo, watermark, border, background decoration, or other people. Natural anatomy.
Primary request: show this character doing a standing dumbbell biceps curl. Hold one dark charcoal dumbbell in each hand, one arm bent curling up and the other slightly lower. Stable balanced stance, friendly focused smile. The action should immediately communicate resistance / strength training.
```

### cardio

- Local source: generated_images/01a080dd-f219-76f3-820e-519708380411/exec-3f984a66-5c8e-4adb-ad9d-3635e33315cf.png
- Saved file: cardio.png

```text
Use case: illustration-story
Asset type: small training-type illustration for a health dashboard.
Input image: the attached image is a STYLE AND CHARACTER REFERENCE, not an edit target and not the requested pose. Preserve the same adult male character identity, dark brown swept hair, friendly face, dark eyes, warm skin tone, rounded facial features, and friendly approachable proportions.
Style/medium: polished soft rounded 2D digital illustration, clean shapes and smooth gentle shading, consistent with the reference's friendly character aesthetic.
Scene/backdrop: clean pure white background with only a subtle light-gray ground shadow.
Wardrobe: solid orange athletic training shirt, main orange #ff9600; navy shorts; white athletic shoes. No green clothing, no blue trim.
Composition/framing: exactly one full-body character centered in a square image. Keep the entire figure, shoes, and any necessary equipment visible. Compact readable silhouette with comfortable white margin on every side. The character should occupy about 80% of the canvas height. A single standalone scene, not a sheet, not a triptych, not a set.
Constraints: no text, letters, labels, UI, logo, watermark, border, background decoration, or other people. Natural anatomy.
Primary request: show this character jogging / running, with bent elbows and a clear running stride, one foot lifted and the other approaching the ground. Friendly energetic smile. The action should immediately communicate cardio / aerobic training.
```

### rest

- Local source: generated_images/01a080dd-f219-76f3-820e-519708380411/exec-91db2fda-06f3-4452-9053-86205c1d8917.png
- Saved file: rest.png

```text
Use case: illustration-story
Asset type: small training-type illustration for a health dashboard.
Input image: the attached image is a STYLE AND CHARACTER REFERENCE, not an edit target and not the requested pose. Preserve the same adult male character identity, dark brown swept hair, friendly face, dark eyes, warm skin tone, rounded facial features, and friendly approachable proportions.
Style/medium: polished soft rounded 2D digital illustration, clean shapes and smooth gentle shading, consistent with the reference's friendly character aesthetic.
Scene/backdrop: clean pure white background with only a subtle light-gray ground shadow.
Wardrobe: solid orange athletic training shirt, main orange #ff9600; navy shorts; white athletic shoes. No green clothing, no blue trim.
Composition/framing: exactly one full-body character centered in a square image. Keep the entire figure, shoes, and any necessary equipment visible. Compact readable silhouette with comfortable white margin on every side. The character should occupy about 80% of the canvas height. A single standalone scene, not a sheet, not a triptych, not a set.
Constraints: no text, letters, labels, UI, logo, watermark, border, background decoration, or other people. Natural anatomy.
Primary request: show this character seated casually on a very simple small neutral light-gray bench, relaxing after exercise, hands resting naturally on thighs, shoulders relaxed, feet visible on the ground, peaceful gentle smile. The action should immediately communicate rest and recovery.
```
