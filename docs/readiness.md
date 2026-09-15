# Jaeger Demo readiness and remaining work

Updated 2026-09-15 after the Q/E control change and combat integration. This is a local development checkpoint against scene-spec.md v1.2, not a release acceptance record.

## Decision

**Ready for an interim local playtest. Not ready for the agreed public release.**

The complete character and environment exist, the character has a qualified batching derivative, 25 clips are delivered, the cradle release plays, and PC movement/flight and real weapon contact are connected. The main remaining risks are presentation, contact/collision edge cases, input/lifecycle behavior, mobile support and missing sustained validation. No public repository or deployment has happened.

No further paid sound or image generation is needed to take the next steps. Keep the existing assets and sound candidates. Prioritize the hand correction, coherent camera/aiming, control reliability and a bounded playtest before optional visual experiments.

## Confirmed current evidence

- `npm test`: 11 tests pass. Typecheck and Vite production build pass. This is not a fresh-checkout/release test.
- Original hero optimization: 470 mesh instances reduced to 139 batches, retaining 71,620 triangles, original graph, native clips and embedded image bytes. Pose/vertex equivalence evidence exists.
- Hero delivery includes the original 16 clips plus nine Kiln-authored pilot helpers. Canonical original download is preserved.
- Environment: 37,340 triangles / 62 batches, Kiln program p_6f8a05f2f517, asset a_e348aa8d82c14985805662d29868fd5b, revision r_867a905770e14aacaab8c55866a67d45.
- Cradle guides support the carriers across 721 sampled poses, with both-side integrated screenshots in `evidence/cradle/`.
- `evidence/combat-check.json`: real exported rig, slash/combo/overhead/cannon/hit/miss/reset scenarios at simulated 30/60/variable render intervals with fixed steps. The overhead example uses its own valid stance at [10,0,-72]; it does not claim every attack hits from every position.
- `evidence/combat-webgpu/` and `evidence/combat-webgl/`: real Q and E key events trigger the correct actions; old J/K bindings are removed. Disc contact, muzzle origins and frame-crossing events are connected. Latest first cannon shot occurs at clip time 0.4, not one tick late through floating point error.
- Combat effects have initial pooled shot streaks and blade ribbons. Their appearance is not yet accepted.
- Short RTX 3070 desktop runs are fast and return no browser errors. They do not prove cold-action, soak, production, or phone acceptance.

## Camera recommendation

Use an action-mech third-person camera: full-body movement framing, stable horizon, restrained shoulder offset, and a smooth aiming view that keeps both the target and weapon direction visible. Flight should widen modestly. No camera bob tied directly to joints.

Keep desired camera heading separate from actual weapon direction. A ground cannon request uses footwork to align, then displays actual muzzle traces; camera pitch cannot imply vertical articulation absent from the native gun pose. Make these traces readable without hiding them behind the character. Avoid adding a lock-on/torso-aim subsystem simply to finish this demo.

Reference: the official [MechWarrior 5 manual](https://static.mw5mercs.com/docs/MW5Mercs_Game%20Manual.pdf), HUD Reticles section, distinguishes where arm weapons and torso/head weapons aim. This supports showing weapon direction honestly; the specific framing recommendation above is our design choice.

Current implementation has an initial shoulder offset and actual dual-barrel indicators. Framing, camera occlusion and ground/flight/intro transitions still require an owner-facing pass.

## Hand finding

`authoring/jaeger/parts/arms.js` places the palm surface/socket on +X and back armor on -X. The mirrored thumb base is on the medial edge (-Z on the right hand, +Z on the left). The fingers also run index-to-little from medial to lateral. With forward-facing palms this is the wrong handedness, consistent with the owner's observation.

Correct the thumb and finger ordering together in Kiln, preserving finger flexion, wrists, arm hierarchy and blade clearances. Review open/closed hands from front/back/side and in attacks, then regenerate and qualify the revised runtime/helper geometry and revision provenance. Preserve the historical canonical v4 download as an original; clearly label the corrected current character. Merely changing a joint name is insufficient.

## Remaining tasks

All items below are unfinished or lack sufficient evidence. The spec remains authoritative; this list groups its requirements rather than dropping them.

### 1. Character finishing and source delivery

- [ ] Correct hand handedness as above; review thumb/index opposition and finger curl in open, closed and attack poses.
- [ ] Re-export through Kiln and regenerate the derived runtime character without losing all 25 clips, protected pivots, sockets or textures. Re-run geometry/socket/pose and backend checks for the actual changed asset.
- [ ] Final front/rear/oblique/flight review of hands and the previously repaired thigh/shin/back/arm surfaces; resolve clipping or recurring z-fighting.
- [ ] Confirm the final world height, sole contact and scale-reference views with the actual final derivative. Existing source/scale evidence remains useful but is not final visual acceptance.

### 2. Camera, aiming and readable combat

- [ ] Finish full-body ground, over-shoulder aiming and wider flight framing; improve the current target occlusion and make impacts visible.
- [ ] Validate orbit/zoom limits, stable horizon, architecture avoidance and smooth 90/180-degree changes, aiming and ground/flight transitions.
- [ ] Make movement intention, body heading and actual gun direction understandable on both mouse/touch. Keep horizontal gun articulation honest.
- [ ] Review repeat firing, lowering weapons, left/right/combo/overhead action visibility, busy/queued feedback and contextual controls.
- [ ] Verify close-obstacle attacks, all target instances and repeated misses/hits; per-instance flashes must remain isolated.

### 3. Movement, contact and collision

- [ ] Stop/settle when collision rejects walking. Current requested velocity/clip can continue stepping against a boundary.
- [ ] Match accepted displacement to animation rate; check all stop phases, continuous steering, 45/90/180-degree turns, attack-after-walk and hop-after-walk.
- [ ] Review actual soles/toes/heels, armor clearance, knee stability and visual IK enabled/disabled. Numeric ankle-target tests alone do not prove these.
- [ ] Measure release-to-stop latency and IK/controller cost.
- [ ] Complete and review the measured body/limb/turn/attack envelopes, prop/architecture masks, retracted cradle proxies and camera masks.
- [ ] Validate overhead takeoff clearance, swept pitched/banked flight, blockers/edges, braking and the full descent footprint/path. No water, terrain or prop landing.
- [ ] Finish presentation interpolation over the fixed controller steps. Maximum four catch-up steps is now enforced, but that alone does not finish the common-clock requirement.

### 4. Intro, reset and lifecycle

- [ ] Finish visor/service-light activation and pressure-release steam at the authored events.
- [ ] Verify armor/cannon/feet/first-step clearance throughout release and exit, including the added guide rails.
- [ ] Finish short skip/replay fades, exact camera/root handoff, reduced-motion intro and skip at every phase without skipped audio firing.
- [ ] Reset camera, idle/alternate-action state, UI, inputs, flashes, effects, sound loops and IK to the declared baseline. Resume must discard stale elapsed time.
- [ ] Stress pause, blur, orientation, reset during flight/attacks and inspector/menu transitions; prevent duplicate handlers/loops and stale queued commands.

### 5. Rendering, effects and scene life

- [ ] Improve the very bright/flat current lighting, warm/cool armor readability, shadow/contact grounding and atmospheric depth.
- [ ] Replace repetitive water bands with coherent waves/normals, Fresnel response and restrained shoreline foam.
- [ ] Finish shaped socket-aligned jets, visible tapered blade trails, muzzle flash/hot core, shot/impact presentation, material-appropriate sparks/dust and landing dust ring. Current shared blue particle burst is inadequate for dust.
- [ ] Add subtle cradle steam and independently controlled service/warning lights. Review human-scale props and terrain seams from playable cameras.
- [ ] Evaluate restrained bloom/contact shading/shadows only as needed, record choices and verify both backends. Extra reflection/volumetric/OIT work is optional.
- [ ] Add restrained damped camera impulses with a reduced-motion option; preserve readable weapons/armor and bounded effect coverage.

### 6. Sound

- [ ] Audition the 12 generated cues on headphones and ordinary speakers/phone. No auditory review has occurred; model audio input is unavailable.
- [ ] Check/trim transients, fades, loop seams, clipping/headroom, attenuation and repeated voice stacking. Prefer the existing files before generating alternatives.
- [ ] Complete synchronized prepare/shutdown/recovery cues or reuse suitable existing recordings; verify state-following loops on pause/reset/landing.
- [ ] Enforce total tier voice limits (mobile <=8 including loops), persist mute and handle audio initialization/decode failure without blocking the visual demo.
- [ ] Record applicable audio generation and redistribution terms/credits without inventing a license.

### 7. Interface, mobile and accessibility

- [ ] Finish simultaneous joystick/look/action pointers, pinch zoom, pointer cancellation/capture cleanup, portrait/landscape layout and safe-area spacing.
- [ ] Ensure >=48px touch controls, legible HUD text, keyboard focus and contextual busy/ground/flight feedback. Reset shortcuts must respect canvas focus.
- [ ] Fix inspector entry/exit and secondary-action behavior; provide a clear inspection location, original/helper grouping, speed/reset-view controls and a useful rig/socket overlay if retained.
- [ ] Finish About/Credits and accessible GLB/source links on welcome/menu/failure screens.
- [ ] Honor and expose reduced motion; persist relevant preferences. Current CSS-only reduced loading motion is insufficient.

### 8. Loading, failures and quality

- [ ] Add a lightweight poster and explicit Retry; test WebGPU failure/WebGL2 retry, unsupported renderer and device loss.
- [ ] Make loading failures clear, keep downloads usable, and cleanly dispose resources if renderer/world is recreated.
- [ ] Implement Auto/High/Low with persisted selection, hysteresis and explicit shadow/render-target/effect/voice budgets. Current quality selector changes only pixel ratio.
- [ ] Cap mobile particles to <=128 (current pool is192), voices and render targets; validate tier switching without altering simulation behavior or recompiling during actions.
- [ ] Warm actual first-use effect/action variants, buffers and shadows, reset warm-up state and measure time to Ready.

### 9. Performance and release qualification

- [ ] Audit repeated allocations and DOM work in controller, IK, weapons and effects; cache/reuse scratch data and profile GC/CPU costs.
- [ ] Measure main-color vs shadow/postprocess draw counts, visible triangles, texture vs render-target memory and optional scenery culling on both backends.
- [ ] Complete cold Start/Skip/every-action tests, repeatable60s worst-case sequence, ten intro/skip/control/flight/reset cycles and ten-minute resource plateau/soak tests.
- [ ] Record device/browser/backend/tier/resolution, p50/p95/p99/longest frames, triggers and object/effect/voice peaks. Do not infer GPU timing from CPU timing or omit unexplained hitches.
- [ ] Run actual Android/iPhone interaction/performance/audio checks; desktop emulation stays labeled as emulation. Unavailable devices remain untested.
- [ ] Validate all clips and runtime sidecar independence in the actual delivered bundle; hash/fetch downloads and inspect source ZIP completeness.
- [ ] Fresh locked install/build/preview, asset decode/upload/transfer/warm-up measurements and production base-path/fallback/download checks.

### 10. Packaging and owner handoff

- [ ] Complete README/run commands, validation table QA-01..QA-30, asset provenance, credits/licenses, final poster and portable reproducible asset build instructions.
- [ ] Remove unused harness entry code and unnecessary delivery files; preserve source/evidence intentionally and exclude credentials/local authoring runtime from visitor bundles.
- [ ] Add truthful local/build identity and final asset hashes to `public/version.json`.
- [ ] Prepare and validate the GitHub Pages workflow locally, with current pinned actions and correct base path. It is not created yet.
- [ ] Leave the finished production preview running and open, supply exact controls/downloads/known issues, then obtain owner playtest feedback and fix accepted issues.
- [ ] Only after explicit release approval: create/push the public repository, deploy Pages, verify the accepted commit/hash identity and live flows. These publication checks do not block delivering the local candidate.

## Credit-conscious sequence

1. Hand correction and one coherent camera/aiming pass.
2. Fix blocked walking, landing/input/reset/inspector failures and essential mobile controls.
3. One restrained lighting/water/effects pass using current assets/audio; owner listens and playtests.
4. Complete tier limits, cold/repeat/soak/device checks and minimal packaging/Pages preparation.
5. Owner approval, then publication and live verification.

Extra creatures, destruction, Rapier, music, elaborate postprocessing and the long automatic showcase remain outside the necessary work. This prioritization does not silently waive the aligned spec.
