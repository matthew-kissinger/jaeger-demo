# Jaeger motion package

**Scope:** this is the existing v4 source contract at its original approximately 8.12 m scale. The [demo spec v1.2](docs/jaeger-demo-spec.md) requires 79.25 m scene scale, new Kiln activation/cradle motion, camera-relative steering and continuous bounded flight. Its integration requirements supersede earlier fixed-turn/flight-segment control plans. Helpers and runtime contact IK still need implementation/rendered review; preserve the sixteen original clips below. Apply source-to-world scale once and distinguish embedded motion from runtime controller/IK corrections.

All sixteen clips are authored with Kiln's native rotation/position tracks. Armor is rigidly attached to mechanical pivots. The animation package contains no Blender data and uses no deforming skin.

Coordinates are metres, +X forward, +Y up, +Z right. Rotation tracks are authored in degrees and exported as quaternion animation. Samples are baked at approximately 30 Hz. The neutral arm pose uses shoulder angles `[-7, 0, 3]` for the right arm and `[7, 0, 3]` for the left, plus an 8-degree elbow bend. Finger roots retain the model's 0.12-radian bend (6.87549 degrees); finger-link bends and thumb transforms stay in the authored bind pose. This matches the model's relaxed bind pose.

## Native export batches

The installed Kiln runtime currently accepts at most 256 animation tracks in one exported execution. Public CLI probes verified that 256 tracks succeeds and 272 rejects; sampling fewer frames does not change that boundary. This full animation package requires 359 useful tracks. Tracks identical to the model's bind pose are omitted and constant non-bind poses use only two keys.

The source compile constant `JAEGER_MOTION_BATCH` selects `ground-combat` (first eight clips, 154 tracks) or `boost-weapons` (remaining eight, 205 tracks). Both batches export through Kiln. The final GLB packages the resulting native animation channels against the identical mech node hierarchy. This packaging must preserve every native track and confirm identical geometry, node names and bind transforms. No animation is authored outside Kiln, and the engine is unchanged.

`JAEGER_MOTION_BATCH = 'all'` retains the complete authoring definition for editing. Use the project's export script, which assembles both selected source variants, to rebuild the complete artifact on this runtime. Passing the all-batch source directly to this version of Kiln's renderer exceeds its current export envelope.

## Ground contact

The hip-to-knee segment is 1.85 m and knee-to-ankle segment is 1.72 m. Pelvis height is 4.25 m, lateral hip offsets are +/-0.69 m, and grounded ankle height is 0.68 m. A closed-form, three-dimensional two-link solver derives hip and knee rotations from world-space ankle targets. Ankle rotations cancel those rotations so the sole retains its intended world orientation.

During stationary motion the ankle targets remain exactly fixed. During turns they remain fixed while each foot is planted. During walking the root moves through space while feet alternate between fixed world-space stance targets and raised swing arcs. Mathematical reachability is asserted while authoring. Actual exported foot geometry, quaternion interpolation, armor clearance, and visual weight still require separate validation and rendered review.

## Clip contract

| Clip | Duration | Start → end | Contact / action |
|---|---:|---|---|
| Idle | 4.00 s | Standing → Standing | Loop; both feet planted |
| Walk | 2.80 s | Standing → Standing translated +X3.2 m | Four alternating steps; root motion |
| TurnLeft | 4.00 s | Standing → Standing rotated +90° Y | Four stepping arcs; left turn |
| TurnRight | 4.00 s | Standing → Standing rotated -90° Y | Four stepping arcs; right turn |
| SlashLeft | 2.50 s | Standing → Standing | Full-body anticipation, hip/torso rotation, slash at 1.00 s, recovery |
| SlashRight | 2.50 s | Standing → Standing | Mirrored full-body slash at 1.00 s |
| SlashCombo | 3.70 s | Standing → Standing | Right strike at 1.00 s, left at 2.20 s |
| OverheadStrike | 3.20 s | Standing → Standing | Raised blades, downward strike at 1.52 s, compression and recovery |
| CannonAim | 1.20 s | Standing → CannonReady | Low braced stance, cannon alignment |
| CannonFire | 1.80 s | CannonReady → CannonReady | Repeatable; right fires at 0.40 s, left at 0.67 s; independent recoil |
| JumpPrepare | 1.10 s | Standing → LaunchCrouch | Both feet planted, body compressed |
| Takeoff | 1.35 s | LaunchCrouch → Hover | Grounded until 0.24 s, rise to root Y2.0 m |
| Hover | 3.20 s | Hover → Hover | Loop at root Y2.0 m, subtle altitude/stabilization motion |
| ForwardFlight | 3.40 s | Hover → Hover translated +X4.0 m | Pitch into forward flight then brake; root motion |
| Landing | 2.00 s | Hover → Standing | Descend, contact at 0.68 s, compress and recover |
| HitRecovery | 2.20 s | Standing → Standing | Recoil, brace, recovery with both feet planted |

### Planted intervals

Intervals are in seconds, including their endpoints. Ankle target X/Z remains constant throughout each interval.

- **Walk right:** 0–0.12, 0.62–1.52, 2.02–2.80. **Walk left:** 0–0.72, 1.22–2.12, 2.62–2.80.
- **Both turns, right:** 0–0.15, 0.90–2.10, 2.85–4.00. **Both turns, left:** 0–1.10, 1.85–3.10, 3.85–4.00.
- **Takeoff, both:** 0–0.24. **Landing, both:** 0.68–2.00.
- Idle, all melee attacks, CannonAim, CannonFire, JumpPrepare and HitRecovery keep both feet planted for their full durations.
- Hover and ForwardFlight have no ground-contact intervals.

## Scene integration later

`Joint_MotionRoot` carries translation and turn rotation. A scene must carry forward its endpoint transform when replaying a root-motion clip or entering the next clip. Do not apply a second locomotion velocity on top of the authored translation. Resetting an action's local animation clock without accumulating the root transform will visibly snap the mech backward.

The intended boost sequence is `JumpPrepare → Takeoff → Hover → ForwardFlight → Hover or Landing`. `Takeoff` and `Hover` share the same airborne endpoint pose. `ForwardFlight` retains the same pose but finishes four metres ahead: place the next action at that horizontal endpoint. `Landing` consumes the two-metre root altitude and returns to standing. The intended cannon sequence is `CannonAim → CannonFire`, with repeated fire permitted from CannonReady. Blend CannonReady back to Idle when lowering the weapons.

Use short 0.12–0.25 s cross-fades between compatible pose states. Cross-fading rigid-joint curves alone cannot guarantee exact planted feet during a transition between different stance heights. A destination runtime may use contact-aware blending or an additional procedural foot solver. The source's exact endpoint match is the baseline; exported transition review remains an acceptance step.

The muzzle sockets follow each cannon slide for later flashes and projectiles; the source animation contract records firing times. Blade trails, hit detection, exhaust, impacts and scene controls belong to the deferred Three.js phase.

## Acceptance status

The source implementation and math generation check are complete. Source validation, exported GLB inspection, intermediate-pose render review, inter-part clearance review, clip playback and the owner's artistic approval are separate evidence. Do not infer those from this document.
