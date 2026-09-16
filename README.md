# Jaeger · Coastal Proving Ground

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg)](https://threejs.org/)
[![WebGPU](https://img.shields.io/badge/Graphics-WebGPU%20%7C%20WebGL2-blue.svg)](https://www.w3.org/TR/webgpu/)
[![Assets: Kiln](https://img.shields.io/badge/Assets%20Forged%20With-Kiln-orange.svg)](https://github.com/matthew-kissinger/jaeger-demo)

An interactive 3D mech showcase powered by Three.js r186, WebGPU, and procedural assets authored with **Kiln**. Features a 79.25-metre articulated Jaeger mech operating on a coastal proving ground with launch cradle, locomotion, flight, blade combat, twin shoulder cannons, and reactive targets.

---

## Procedural 3D with Kiln

This repository demonstrates code-first procedural 3D asset authoring and compilation using **Kiln**. Rather than modeling polygons manually in Blender or Maya, every 3D asset in the project was authored directly in JavaScript source code (`.kiln.js`):

- **Procedural Geometry**: Surfaces, structural flanges, pauldron shells, hydraulic pistons, turbine housings, blade rails, gantry towers, and target structures are defined using mathematical primitives, constructive solid geometry (CSG), and lofted profile extrusions.
- **Integrated Rigging**: Skeletal hierarchies, kinematic pivots, and weapon sockets are declared alongside geometry definitions, keeping kinematics and surface math synchronized.
- **Parametric Clearances**: Code-defined geometry allows millimeter-precise mechanical clearances. The launch cradle's retraction carriers slide smoothly along guide rails across 721 sampled poses without clipping or z-fighting.
- **Automated Optimization**: Kiln's compilation pipeline batches complex procedural models for real-time web delivery, reducing the Jaeger's 470 component instances down to 139 runtime batches (71,620 triangles) while preserving material boundaries and embedded animation tracks.
- **Version-Controlled Assets**: Because 3D assets are code, they live in git repositories, can be diffed line-by-line, reviewed in pull requests, and deterministically compiled in CI/CD pipelines.

---

## Live Demo

Run the interactive demo in your browser:
[https://matthew-kissinger.github.io/jaeger-demo/](https://matthew-kissinger.github.io/jaeger-demo/)

Runs natively on WebGPU with automatic fallback to WebGL2 for older browsers and mobile devices.

---

## Open Source 3D Assets

All 3D assets in this project are licensed under the MIT License:

- [Jaeger Pilot GLB](public/assets/jaeger-pilot.glb) — Fully rigged and batched (71,620 triangles, 139 batches) with 25 embedded animation clips.
- [Original Jaeger Complete v4 GLB](public/downloads/jaeger-complete-v4.glb) — Canonical solid delivery mesh.
- [Coastal Proving Ground Environment GLB](public/assets/environment.glb) — Modular pier, launch cradle, rails, and reactive training targets.
- [Kiln Source Bundle (ZIP)](public/downloads/jaeger-complete-v4.zip) — Complete procedural geometry source files.

---

## Controls

### Desktop PC

| Input | Action |
| :--- | :--- |
| **W / A / S / D** | Walk and steer relative to camera |
| **Mouse Drag / Click** | Look around (click canvas for pointer lock) |
| **Left Click / Q** | Energy blade slash (alternates left/right; double-click chains combo) |
| **C** | Blade combo attack |
| **F / X** | Overhead strike (ground cleave / airborne dive slam) |
| **Right Click / E** | Twin shoulder cannons (converges on crosshair) |
| **Space** | Tap to hop; hold for sustained flight |
| **Shift** | Boost cruise flight |
| **B** | Air brake / rapid descent |
| **V / Middle Click** | Swap over-the-shoulder camera view (Left/Right) |
| **Mouse Wheel** | Zoom camera in / out |
| **Esc / M** | Menu (Quality, Reset, Replay Intro) |

### Mobile & Touch

- **Landscape Mode**: Requires landscape orientation for comfortable aspect ratio and thumb clearance.
- **Virtual Joystick** (Bottom-left): 360-degree ground locomotion and flight steering.
- **Touch Swipe** (Center/Right): Drag to rotate camera.
- **Pinch-to-Zoom**: Two-finger pinch adjusts camera distance.
- **Radial Thumb Cluster** (Bottom-right): Primary Slash button with satellite Combo, Overhead/Slam, and Cannon buttons, plus Hop, Boost, and Brake controls.

---

## Architecture & Systems

- **WebGPU / WebGL2 Backend**: Three.js r186 WebGPU renderer with ACESFilmic tone mapping and automatic WebGL2 fallback.
- **TSL Ocean Shader**: Real-time water surface written in Three.js Shading Language (TSL) with multi-octave Gerstner wave displacement, Fresnel sky reflections, sun glints, and foam crests.
- **Locomotion & Contact IK**: Continuous alternating mechanical strides (`PilotWalk`) and inertia-absorbing stop physics (`PilotStop`) synchronized to ground velocity with analytic two-bone leg IK (`ContactIK`).
- **Over-the-Shoulder Aiming & Convergence**: Dynamic FOV (42° aim, 48° default, 54° flight) with dual-barrel raycast convergence that aligns both shoulder cannons directly onto the target crosshair.
- **Reactive Combat Physics**: Damped torsional pendulum physics on target nodes that dynamically tilt on weapon impact and oscillate back to center.
- **Camera Trauma & Shake**: Damped physics-based impulse model responding to cannon recoil, high-velocity landings, and blade impacts.
- **Extended Proving Ground**: 1240-meter proving ground platform with modular concrete foundation, launch lane striping, seawalls, and spaced combat target ranges.

---

## Local Development

### Prerequisites

- Node.js 20+ or 22+

### Installation

```bash
git clone https://github.com/matthew-kissinger/jaeger-demo.git
cd jaeger-demo
npm install
```

### Development Server

```bash
npm run dev
```

Open `http://127.0.0.1:5186/jaeger-demo/` in your browser.

### Test Suite

```bash
npm test
```

### Production Build

```bash
npm run build
npm run preview
```

Output is bundled into `dist/`.

---

## License

This project and all included 3D assets are released under the [MIT License](LICENSE).

