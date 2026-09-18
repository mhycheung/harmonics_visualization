# Spin-weighted spherical harmonics

Interactive visualization of spin-weighted spherical harmonics ₛY_ℓm for s = 0, ±1, ±2 and ℓ ≤ 5.

Live page: https://mhycheung.github.io/harmonics_visualization/

- s = 0: color = Re f.
- |s| = 1: arrows; |s| = 2: headless segments (stretch axis of a TT strain). Color = |f|.
- Optional time factor e^{−iωt}; show m and −m separately or summed.
- Drag any sphere to rotate all spheres.

Conventions (Goldberg formula, LAL/SXS sign convention; glyph angle χ = sign(s)·arg f / |s|) are listed on the page.
Static site: `index.html`, `app.js`, `swsh.js` (three.js from jsDelivr CDN).
