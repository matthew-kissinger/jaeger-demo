# Jaeger Demo implementation goal

**Aligned specification:** [Jaeger Demo v1.2](scene-spec.md), 2026-09-15. **Completion boundary:** finished local production build for owner playtesting. Publication is a later, separately approved step. This document supplies a goal; writing it does not start implementation.

## Copy-ready execution goal

Build **Jaeger Demo: Coastal Proving Ground** to completion in a separate local repository at `C:/Users/Mattm/X/jaeger-demo`, following `C:/Users/Mattm/X/kiln-mech/docs/jaeger-demo-spec.md` v1.2 and all local acceptance requirements. Deliver a finished interactive production scene running locally so I can playtest before any public GitHub/Pages publication.

Use Astra and Kiln for every solid asset and mechanical animation: Jaeger, towering cradle, retracting braces/service connector, hangar, props, targets, uneven coastal terrain and required activation/locomotion/flight helpers. Verify/update the actual authoring workspace against current Kiln main and preserve source/runtime provenance. Exclude the disposable dogfood asset. Make the Jaeger **79.25 m tall (260 ft benchmark)** against human-scale vehicles, doors and railings; apply scene scale consistently to motion, collision, IK, sockets, effects and flight distances. Preserve the original source-scale GLB.

Create a skippable approximately **12-second cradle-release intro** with activation, braces opening, connector withdrawal and a weighty walk onto the deck, then seamlessly hand off camera and pose to play. Include Replay Intro and a separate post-intro Reset. All visible cradle parts and mechanical tracks come from Kiln.

Use the [licensed Gipsy Danger height reference](https://www.prime1studio.com/pacrim-gipsy-danger/UDMPACRIM-01.html) as the scale benchmark: 260 ft converts to 79.248 m, rounded to 79.25 m for this custom design. Verify the measured neutral world height within 0.05 m using the spec's stated bounds convention, and capture low intro and normal gameplay views beside measured human-scale props. Camera, motion and atmosphere must convey that size during play.

Implement **third-person, camera-relative PC/mobile controls**: smooth arbitrary ground steering; flight following camera look direction including pitch; Space tap for hop-and-land, hold for sustained flight and release for safe landing; camera-relative WASD travel/braking and equivalent touch joystick/look/Hop/Boost-Land controls. Author needed helpers in Kiln and wire/review all sixteen original animations, blends and lightweight leg IK where needed. Preserve planted feet, weight, clearance and smooth transitions. Use custom collision proxies/sweeps and BVH only where justified. Include intact-target blade/cannon feedback. Destruction, Rapier, creatures and full-game systems are outside scope.

Use current official Three.js documentation and pinned matching dependencies, with r186 as the verified baseline, WebGPU and tested WebGL2 fallback. Complete shared PBR materials/textures, motion-safe batching, merged Kiln runtime export profiles, coherent lighting, TSL water/atmosphere, restrained ambient motion, socket-aligned effects and auditioned offline ElevenLabs audio using my authorized access. Finish animation inspection, quality settings, accessibility, pause/mute/reset, downloads, credits and provenance. Provide original GLB/source and the scene's extended animation delivery.

Meet the spec's visual, animation/IK, control, collision, intro/skip/reset and performance requirements. Measure cold actions, frame pacing and resource stability on named devices/backends, fix failures, preserve targets unless I accept a documented revision, and label unavailable device coverage honestly. Do not stop at a blockout, viewer, cinematic-only prototype or untested harness.

Leave the **production preview running at the tested `/jaeger-demo/` base path**, open it for me, and return its exact URL, PC/mobile controls, downloads, validation evidence and concise known issues. Prepare reproducible build commands and GitHub Pages configuration locally. **Stop for my playtest and feedback before creating/pushing the public GitHub repository or deploying Pages.** Address feedback and publish only after my explicit release approval.

## Later release step

After playtesting, fixes and approval, create/push the intended `jaeger-demo` GitHub repository, deploy the accepted commit through Pages Actions, and verify live manifest/asset hashes, base paths, renderer fallback and complete intro/control/flight/reset/download flow. Report repository/Pages URLs, exact commit and tested coverage. This step is outside the initial local-completion goal.
