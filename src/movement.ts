export interface Point { x: number; y: number; z: number }
export interface Obstacle { min: number[]; max: number[]; id?: string }
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const ease = (value: number) => { const u = clamp(value, 0, 1); return u * u * (3 - 2 * u); };
export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const turnToward = (from: number, to: number, maximum: number) => from + clamp(angleDelta(from, to), -maximum, maximum);
export function cameraTravel(forward: number, right: number, yaw: number, pitch: number, flight: boolean): Point {
  const scale = Math.max(1, Math.hypot(forward, right)), f = forward / scale, r = right / scale, cp = flight ? Math.cos(pitch) : 1;
  return { x: Math.cos(yaw) * cp * f - Math.sin(yaw) * r, y: flight ? Math.sin(pitch) * f : 0, z: Math.sin(yaw) * cp * f + Math.cos(yaw) * r };
}
// Swept horizontal body volume against authored static proxies. Solve the earliest
// contact, then slide the remaining displacement along its tangent, up to 3 contacts.
export function sweepMove(start: Point, delta: Point, radius: number, obstacles: Obstacle[]): Point {
  const p = { ...start }, d = { ...delta };
  for (let iteration = 0; iteration < 3; iteration++) {
    let hit = 1, nx = 0, nz = 0;
    for (const box of obstacles) {
      if (p.y > box.max[1] + 1 || p.y + 79.25 < box.min[1]) continue;
      let enter = -Infinity, exit = Infinity, normalX = 0, normalZ = 0;
      for (const [axis, i] of [['x', 0], ['z', 2]] as const) {
        const lo = box.min[i] - radius, hi = box.max[i] + radius, value = p[axis], step = d[axis];
        if (Math.abs(step) < 1e-9) { if (value < lo || value > hi) { enter = Infinity; break; } continue; }
        const a = (lo - value) / step, b = (hi - value) / step, near = Math.min(a, b);
        if (near > enter) { enter = near; normalX = axis === 'x' ? -Math.sign(step) : 0; normalZ = axis === 'z' ? -Math.sign(step) : 0; }
        exit = Math.min(exit, Math.max(a, b));
      }
      if (enter <= exit && enter >= 0 && enter < hit) { hit = enter; nx = normalX; nz = normalZ; }
    }
    const fraction = Math.max(0, hit - (hit < 1 ? 0.0001 : 0));
    p.x += d.x * fraction; p.z += d.z * fraction;
    if (hit === 1) break;
    d.x *= 1 - hit; d.z *= 1 - hit;
    const into = d.x * nx + d.z * nz; d.x -= into * nx; d.z -= into * nz;
  }
  p.y += delta.y; return p;
}
