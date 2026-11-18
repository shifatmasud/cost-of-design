# The Cost of Design

A one-page idea by Shifat Masud: every element you add has a price, for the machine and for the mind. Good design is knowing what to spend it on.

Live: https://cost-of-design.vercel.app/

- Static page: `index.html`, no build step.
- Type: [Allo](https://allo.joshpuckett.me) by Josh Puckett, SIL OFL 1.1 (`fonts/OFL.txt`). `fonts/AlloRound.woff2` is a Latin subset with roundness set to 100 and weights 400 to 700.
- 3D: Three.js 0.187 with `MeshToonMaterial` (3-step cel ramp) and inverted-hull outlines. One orange cube with eyes is the recurring character. One WebGL canvas renders every 3D view with scissor, and only the views on screen.
- Motion: Motion 14 (the Framer Motion library) for reveals, staggers, scroll-linked 3D and hover springs. Respects reduced motion.
- Deploys on Vercel from `main`.
