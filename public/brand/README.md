# 身体日记 · 卡通 Logo 首稿

当前产品 Logo 为用户附图明确指定的 [抱绿色日记本的橙色小水獭](option-03-otter.png)。已接入首页顶栏、启动页品牌、启动页日记插画及浏览器图标，保留其造型、配色、坐姿和卷尾。此前「芽芽」精修仅作为未选用探索保留，见 [SPROUT.md](SPROUT.md)。

生产素材为 [256px 透明 Logo](body-journal-otter.png) 与 [64px favicon](../favicon.png)，由用户选定原图通过系统 `sips` 等比例缩放，没有重新生成、改色或裁切。页面使用现有 `next/image` 组件并直接加载已缩放资源；桌面品牌尺寸56px，520px及以下窄屏44px，日记插画品牌24px。品牌文字已提供名称，因此图片使用空alt避免重复读屏。原始生成方式和完整提示词保留在 [OPTIONS.md](OPTIONS.md) 的“03 · 元气水獭”中。

已核对原图与用户附件 SHA-256 完全相同；派生图片保持RGBA及真实透明像素，资源HTTP 200。浏览器在合成数据下核对1280px与390px的启动页和首页，小水獭完整加载、品牌文案保留，favicon元数据指向 `/favicon.png`。完整验证记录位于 `../../../work/brand/otter-RESULTS.md`。

新增10款备选见 [对比页](options.html)，编号、独立原图及完整提示词见 [方案说明](OPTIONS.md)。本文件保留上一轮首稿的来源记录。

设计日期：2026-09-22。生成方式：Codex 内置 ImageGen。

## 设计

「会微笑的小日记」：绿色圆角封面、米白大眼睛、微笑、两只小脚和橙色书签。以日记本代表持续记录，用友善表情表达陪伴；绿色沿用产品主色，橙色与训练模块呼应。它是独立品牌图形，未替换 Captain。

交付：`body-journal-logo-v1.png`，1254 × 1254，PNG，带 alpha 通道。当前是可供评审的设计首稿，未接入页面或 favicon；未输出 SVG。

## 验证

- 已目视核对完整轮廓、表情、橙色书签及无文字要求，文件可读。
- `sips` 确认像素尺寸为 1254 × 1254、`hasAlpha: yes`。
- 原图含轻微渐变与高光，比提示词要求的纯平面多一些体积感；需要矢量化时应简化这些细节。
- `../../../work/brand/logo-review.html` 提供 32 / 48 / 96 / 256 CSS px 以及顶栏品牌组合预览。浏览器安全策略阻止了 `file://` 访问，未完成该页面的小尺寸目视验收，不宣称已通过。
- 本轮未更改应用代码，不运行无关的应用测试与构建。

## 完整提示词

```text
Use case: logo-brand.
Asset type: original mascot logo for 身体日记 / Body Journal, a friendly personal diary app for body measurements, meals, and exercise.
Primary request: Create ONE polished, memorable cartoon logo: a cheerful anthropomorphic little green journal. Deliver the symbol alone, no lettering, on a genuinely transparent background, square canvas.
Subject: A compact upright closed notebook, softly rounded squarish green front cover that also serves as the character's face. Nearly frontal, with just enough right-hand thickness to show one simple warm ivory page edge. Two large expressive ivory oval eyes with deep forest-green pupils looking toward the viewer; a small confident friendly curved smile. A single short burnt-orange ribbon bookmark emerges from the top-right edge, like a playful tuft, with a simple notched tip. Two very small rounded green feet at the bottom, integrated into a compact silhouette; no arms, no hands, no extra props. Slightly jaunty 5-degree tilt, emotionally warm and quietly encouraging.
Style/medium: professional vector-friendly flat cartoon brand mark; playful geometric construction, chunky rounded shapes, strong readable silhouette and restrained two-tone cel shading. The approachable simplicity and expressive character of Duolingo-inspired product design, but an entirely original BOOK character with its own identity. No owl anatomy. Make it feel appropriate for adults as well as playful.
Color palette: app primary fresh grass green #58B518, a lighter green #86D43A highlight shape, deep green #347516 only for minimal side depth; eyes and page edge warm ivory #FFFDF4; pupils and smile forest ink #243E2D; one tiny orange accent #F4A348. No other colors.
Composition/framing: single large centered standalone logo, occupying roughly 78 percent of the canvas, generous clean transparent safe area. No board, no mockup, no surrounding badge or rounded-square app tile. Keep all elements comfortably inside the frame.
Constraints: communicate a diary companion rather than a medical service or weight-loss product; visible face remains clear at 32–48 px. Use few large shapes. At most one simple spine detail; no ruled pages, no tiny strokes or decorative hearts. No text, letters, numerals, captions, watermarks, stars, leaves, dumbbells, scales, hospital crosses, detached objects, complex scene, gradients, glossy 3D rendering, black outlines, realistic paper texture, cast shadow, or checkerboard pattern. Actual transparent alpha background.
```
