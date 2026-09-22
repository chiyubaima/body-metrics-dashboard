# 芽芽 · 未选用探索 v2

本次探索源于助手对用户图片编号的误解。用户随后用附图明确选定的是 [抱绿色日记本的橙色小水獭](option-03-otter.png)，不是芽芽。以下保留当时的产物、验证与原始提示词，仅作生成溯源；提示词中关于“用户选中”的措辞反映当时的错误理解，不代表当前事实。

## 交付

- 文件：[body-journal-sprout-v2.png](body-journal-sprout-v2.png)
- 1254 × 1254，RGBA PNG，实际透明背景。
- 生成方式：Codex 内置 ImageGen，以 [01 原稿](option-01-sprout.png) 为编辑目标。
- 本轮为设计交付，未接入应用页面、favicon 或 Captain；原稿及10个候选均保留。

## 改动

- 叶片缩短并贴近头顶，主体与脸在整体中的比重提高。
- 眼睛与微笑更突出；保留原来的两叶、圆润身体、小脚及友善表情。
- 去除大面积橙色腹部色块，改为两处小面积橙色脸颊，减少对牛油果果核的联想。
- 去除原有明显高光、简化明暗层次；生成图仍有轻微渐变，属于更平面的位图，未宣称为纯色矢量成品。

## 验证

- 原图与32 / 48 / 96像素缩略图均解码正常，RGBA通道及实际透明/不透明像素检查通过。
- 使用系统 `sips` 仅作等比例缩放生成检查图，没有用程序修改角色。Python Pillow只用于读取与验证图像，不做图像编辑。
- 通过 `view_image` 逐一查看真实像素缩略图：32px下两叶和圆润主体可识别，眼睛可见，但笑嘴及脸颊细节较弱；48px下脸部表情可以区分；96px下表情及两叶结构清楚。推荐页面展示至少48px。
- 缩略图保留于 `../../../work/brand/sprout-v2-32.png`、`sprout-v2-48.png`、`sprout-v2-96.png`。这是位图缩放检查，未声称完成浏览器页面或16px favicon验收。
- 应用逻辑未更改，不运行无关的应用全量测试或构建。

## 完整编辑提示词

```text
Use case: precise-object-edit / logo-brand.
Input image 1: EDIT TARGET, the selected original "芽芽" Body Journal sprout mascot. This exact character was selected by the user. Refine it faithfully; do not invent a different mascot.
Primary request: polish this selected logo for small app-header usage with these three approved changes.

1. PROPORTIONS: Keep the plump soft green seed/bean body, two tiny feet, two-leaf crown, big ivory oval eyes, dark forest-green pupils, and small thick curved cheerful smile. Keep the same friendly slightly goofy expression and asymmetrical leaf rhythm. Shorten the two mint-green leaves to about 60% of their current length, and shorten the stalks substantially so they sit close to the crown. The leaf crown should occupy only the upper 20–23% of the character height. The round body becomes the dominant shape; slightly round its upper shoulders so it is more of a soft bean than a sliced pear. Enlarge the eyes-and-smile grouping by about 30%, centered higher on the body; give the pupils clear directional agreement and preserve the friendly gaze.

2. ORANGE ACCENT: Remove the large orange seed/pit-shaped belly patch completely. Keep the belly plain green. Reuse the orange only as two very small simple rounded cheek dashes just below the outer corners of the eyes. The marks should feel warm and friendly and occupy less than 2% of the whole character. No orange oval on the belly, no seed pit, no chest emblem, no props.

3. FINISH: Convert the existing glossy gradient rendering into crisp nearly flat vector-style shapes. Body uses one solid fresh grass green close to #58B518 and at most one subtle flat darker green shape along its bottom contour. Leaves use mint #82CEAD with one flat darker green half, no veins. Ivory eyes #FFFDF4, face ink #243E2D, tiny cheek accents #F4A348. Remove ALL glossy reflections, gradients, airbrushing, drop shadows, sheen, surface noise, rough fringe and stray pixels. Edges must be smooth and clean with normal antialiasing, no outline stroke. Preserve the original simple rounded aesthetic while making it much cleaner.

Composition/output: ONE refined isolated mark centered on a square canvas. Entire character visible with 10% transparent margin, no cropping. Actual transparent alpha background, NOT white or a checkerboard illustration. No typography, labels, comparison panels, app tiles, extra objects, leaves beyond the original two, arms, fingers, eyebrows, nose, clothes, medical symbols or new facial expressions. Strong distinctive silhouette and readable eyes and smile at 32–48 pixels. This is the same chosen sprout character after a careful design refinement.
```
