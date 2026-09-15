# Medal artwork sources

- Generated 2026-09-14 with the built-in `image_gen` tool.
- Exactly three original artwork requests ran in one parallel batch; no variants, retries, or edits.
- These are synthetic, generic selectable example artworks and shared style references. They do not represent real user achievements.
- Original generated PNG files are preserved unchanged. Background is white, not transparent. The application supplies the circular frame.
- Scope: assets only; no app or Site files edited.

## Public assets

- `whale.jpg` — derived from the original generated whale image.
- `mountain.jpg` — derived from the original generated mountain image.
- `lighthouse.jpg` — derived from the original generated lighthouse image.
- Original PNGs are retained only in the local asset workspace; machine paths and generation-session identifiers are not published.

## Visual inspection

- All three have rich enamel color, silver outlines, softly rounded relief, a front-facing composition, white background, no outer medal ring, no lettering, and no watermark.
- Whale: recognizable upward whale silhouette and broad blue/cyan waves. Fine eye and belly divisions are secondary at small sizes.
- Mountain: strongest simple silhouette and warm palette contrast; small flag remains a distinctive top detail. Broad lower corners need circle-safe padding.
- Lighthouse: recognizable blue/ivory striped tower and teal wave base. It occupies more canvas height than the other two; use circle-safe padding rather than edge cropping.
- The supplied circular safe-area instruction was only approximately followed. Integrate with contain sizing and modest extra padding, then verify the 64 px UI render. Keep all originals unchanged.

## Full prompts

### whale

```text
Use case: stylized-concept
Asset type: original square raster emblem artwork for selectable sample medals in a personal fitness app. This is synthetic generic example artwork, not a real person's award.
Style/medium: premium enamel pin illustration, smooth rich enamel fills, subtle brushed silver dividers and outlines, softly rounded raised relief. Consistent compact collectible enamel art.
Composition/framing: square 1024 x 1024 image; exactly one centered emblem, straight-on orthographic front view, no perspective skew. The complete artwork fits inside an invisible circular safe area with diameter 84 percent of the square canvas, leaving clean white breathing room on every side. Keep the subject bold and immediately readable at 64 px; use broad simple shapes and only a few carefully chosen details.
Scene/backdrop: perfectly plain clean white background.
Lighting/mood: soft studio light from upper left, tasteful restrained highlights, minimal soft contact shadow.
Constraints: no outer medal frame, no ring, no circular disk backing, no rim, no loop, no chain, no clasp, no lettering, no numerals, no logos, no watermark, no UI. Do not draw the invisible circle. No extra stars or decorations. Balanced rich saturated colors, never washed out.
Primary request: an original blue whale leaping in a gentle upward arc from stylized ocean waves. A compact cohesive composition: expressive whale silhouette above two sweeping wave bands, visible tail and one flipper, tiny simple eye. Whale blue and cyan enamel, deep-blue and turquoise waves, restrained white highlights.
```

### mountain

```text
Use case: stylized-concept
Asset type: original square raster emblem artwork for selectable sample medals in a personal fitness app. This is synthetic generic example artwork, not a real person's award.
Style/medium: premium enamel pin illustration, smooth rich enamel fills, subtle brushed silver dividers and outlines, softly rounded raised relief. Consistent compact collectible enamel art.
Composition/framing: square 1024 x 1024 image; exactly one centered emblem, straight-on orthographic front view, no perspective skew. The complete artwork fits inside an invisible circular safe area with diameter 84 percent of the square canvas, leaving clean white breathing room on every side. Keep the subject bold and immediately readable at 64 px; use broad simple shapes and only a few carefully chosen details.
Scene/backdrop: perfectly plain clean white background.
Lighting/mood: soft studio light from upper left, tasteful restrained highlights, minimal soft contact shadow.
Constraints: no outer medal frame, no ring, no circular disk backing, no rim, no loop, no chain, no clasp, no lettering, no numerals, no logos, no watermark, no UI. Do not draw the invisible circle. No extra stars or decorations. Balanced rich saturated colors, never washed out.
Primary request: an original angular mountain summit with a small flag planted at its peak. Compact geometric mountain mass with two clearly contrasting faceted slopes and a simple tiny pennant on a short silver pole. Orange, burnt-orange and golden amber enamel facets; flag in rich amber. Bold mountain silhouette, restrained relief, no landscape backdrop.
```

### lighthouse

```text
Use case: stylized-concept
Asset type: original square raster emblem artwork for selectable sample medals in a personal fitness app. This is synthetic generic example artwork, not a real person's award.
Style/medium: premium enamel pin illustration, smooth rich enamel fills, subtle brushed silver dividers and outlines, softly rounded raised relief. Consistent compact collectible enamel art.
Composition/framing: square 1024 x 1024 image; exactly one centered emblem, straight-on orthographic front view, no perspective skew. The complete artwork fits inside an invisible circular safe area with diameter 84 percent of the square canvas, leaving clean white breathing room on every side. Keep the subject bold and immediately readable at 64 px; use broad simple shapes and only a few carefully chosen details.
Scene/backdrop: perfectly plain clean white background.
Lighting/mood: soft studio light from upper left, tasteful restrained highlights, minimal soft contact shadow.
Constraints: no outer medal frame, no ring, no circular disk backing, no rim, no loop, no chain, no clasp, no lettering, no numerals, no logos, no watermark, no UI. Do not draw the invisible circle. No extra stars or decorations. Balanced rich saturated colors, never washed out.
Primary request: an original lighthouse standing among gentle stylized ocean waves. Compact sturdy lighthouse centered above two broad curling wave bands, a simple lantern room and roof clearly readable. Blue and teal enamel with small ivory accents, deep navy outlines within the silver metalwork, rich turquoise waves. No separate sky or landscape backdrop.
```


Production copies resized to 640px JPEG with macOS sips, quality 85. No semantic image editing. data/medal-reference.json embeds the mountain sample as the fixed Images edits style reference.
