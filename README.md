# Jaeger · Coastal Proving Ground

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg)](https://threejs.org/)
[![WebGPU](https://img.shields.io/badge/Graphics-WebGPU%20%7C%20WebGL2-blue.svg)](https://www.w3.org/TR/webgpu/)
[![Assets: Kiln](https://img.shields.io/badge/Assets%20Forged%20With-Kiln-orange.svg)](https://github.com/matthew-kissinger/jaeger-demo)

An open-source interactive 3D mech showcase powered by Three.js r186, WebGPU, and procedural assets authored with **Kiln**. Features a 79.25-metre articulated Jaeger mech operating on a coastal proving ground with launch cradle, interactive locomotion, flight, blade combat, twin shoulder cannons, and reactive targets.

---

## ⚡ Demonstrating Kiln: The Power of Code-First 3D

This entire project was created to demonstrate the power and versatility of **Kiln**, a code-first procedural 3D asset authoring and compilation engine. 

Instead of traditional, manual polygon modeling in DCC tools like Blender or Maya, **every single 3D asset in this repository was procedurally authored through Kiln JavaScript source code (.kiln.js)**:

- **100% Procedurally Authored Geometry**: Every surface, structural flange, pauldron shell, hydraulic piston, turbine housing, forearm blade rail, launch cradle tower, carriage guide rail, and target disc was constructed purely from mathematical primitives, constructive solid geometry (CSG), and lofted profile extrusions written in code.
- **Complex Mechanical Rigging in Code**: Kiln allows defining hierarchical skeletal bones, kinematic pivots, and weapon mount sockets directly alongside geometry definitions, keeping kinematics and surface math perfectly synchronized.
- **Parametric Precision & Fit**: Code-defined geometry allows millimeter-precise mechanical clearances. The launch cradle's retraction carriers slide smoothly along guide rails across 721 sampled poses without clipping or z-fighting.
- **Automated Runtime Optimization**: Kiln's compilation pipeline automatically optimizes and batches complex procedural models for real-time web delivery—reducing the Jaeger's 470 individual component instances down to 139 runtime batches (71,620 triangles) while preserving material boundaries and embedded animation tracks, achieving a solid **144 FPS in WebGPU**.
- **Version-Controlled, Reproducible 3D**: Because 3D assets are code, they live in git repositories, can be diffed line-by-line, reviewed in pull requests, and deterministically compiled in CI/CD pipelines.

---

## 🎮 Live Demo

Experience the live interactive demo directly in your browser:
**[Launch Jaeger Demo](https://matthew-kissinger.github.io/jaeger-demo/)**

*(Automatically runs on WebGPU when supported, with instant fallback to WebGL2 for older browsers and mobile devices).*

---

## 📦 Open Source 3D Assets (Free to Download)

All 3D assets in this project are open source under the **MIT License**. Anyone can download and use the .glb models for games, animations, 3D printing, or personal projects:

- **[Download Jaeger Pilot GLB](public/assets/jaeger-pilot.glb)** — Fully rigged and batched (71,620 triangles, 139 batches) with all 25 animation clips embedded.
- **[Download Original Jaeger Complete v4 GLB](public/downloads/jaeger-complete-v4.glb)** — Canonical solid delivery mesh.
- **[Download Coastal Proving Ground Environment GLB](public/assets/environment.glb)** — Modular pier, launch cradle, rails, and reactive training targets.
- **[Download Kiln Source Bundle (ZIP)](public/downloads/jaeger-complete-v4.zip)** — Full procedural geometry source files.

---

## 🕹️ Controls

### Desktop PC
| Input | Action |
| :--- | :--- |
| **W / A / S / D** | Walk & steer relative to camera |
| **Mouse Drag / Click** | Look around (Click canvas for pointer-lock) |
| **Space** | Tap to hop · Hold for continuous flight |
| **Q** | Energy blade slash attack |
| **E** | Fire twin shoulder cannons (converges on crosshair) |
| **Middle Click** | Swap over-the-shoulder camera view (Left/Right) |
| **Mouse Wheel** | Zoom camera in / out |
| **B** | Air brake / descent |
| **Esc / M** | Pause menu (Quality, Reset, Replay Intro) |

### Mobile & Tablet
- **Virtual Joystick** (Bottom-left): Responsive 360° ground locomotion and flight steering.
- **Touch Swipe** (Right half): Smooth drag-to-look camera rotation.
- **Pinch-to-Zoom**: Two-finger pinch gesture smoothly adjusts camera distance.
- **Touch Action Buttons** (Bottom-right): Dedicated buttons for **Slash**, **Cannon**, **Hop**, **Boost**, and **Brake**.

---

## ✨ Features & Architecture

- **WebGPU / WebGL2 Dual Backend**: Next-generation WebGPU renderer with dynamic ACESFilmic tone mapping and automatic graceful fallback to WebGL2 on mobile browsers.
- **Procedural TSL Ocean Shader**: Real-time water surface written in Three.js Shading Language (TSL) featuring layered multi-octave Gerstner waves, Fresnel sky reflections, sun glints, and crest foam.
- **Over-the-Shoulder Aiming & Convergence**: Dynamic FOV (42° aim, 48° default, 54° flight) with dual-barrel raycast convergence that aligns both shoulder cannons directly onto the target crosshair.
- **Reactive Combat Physics**: Procedural damped torsional pendulum physics on all target nodes — targets dynamically tilt on impact and realistically oscillate back into position.
- **Procedural Foot Contact IK**: Adaptive two-bone leg positioning ensuring stable foot planting and elevation contact across deck structures.
- **Camera Trauma & Shake**: Damped physics-based impulse model responding to cannon recoil, high-velocity landings, and blade impacts.

---

## 🛠️ Local Development & Build

### Prerequisites
- [Node.js](https://nodejs.org/) v20+ or v22+

### Installation
`ash
git clone https://github.com/matthew-kissinger/jaeger-demo.git
cd jaeger-demo
npm install
`

### Run Local Dev Server
`ash
npm run dev
`
Open http://localhost:5173/jaeger-demo/ in your browser.

### Run Tests
`ash
npm test
node scripts/check-combat.mjs
`

### Production Build
`ash
npm run build
npm run preview
`
Production assets are generated in dist/.

---

## 📄 License

This project and all included 3D assets are released under the [MIT License](LICENSE).
