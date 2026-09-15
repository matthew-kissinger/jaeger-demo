import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraTravel, sweepMove, turnToward } from '../src/movement.ts';
test('ground follows camera yaw while flight follows full pitch and diagonals stay normalized', () => {
  const ground = cameraTravel(1, 0, 0, Math.PI / 4, false);
  assert.ok(Math.abs(ground.x - 1) < 1e-8); assert.equal(ground.y, 0);
  const flight = cameraTravel(1, 0, 0, Math.PI / 4, true);
  assert.ok(Math.abs(flight.x - Math.SQRT1_2) < 1e-8 && Math.abs(flight.y - Math.SQRT1_2) < 1e-8);
  const diagonal = cameraTravel(1, 1, 1.1, 0.6, true);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y, diagonal.z) - 1) < 1e-8);
});
test('a fast step cannot tunnel through a target and diagonal contact slides', () => {
  const obstacle = [{ min: [5, 0, -4], max: [7, 90, 4] }];
  const p = sweepMove({ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, 1, obstacle);
  assert.ok(p.x < 4 && p.x > 3.9);
  const slide = sweepMove({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, 1, obstacle);
  assert.ok(slide.x < 4.01 && slide.z > 9.9);
});
test('steering takes the shortest turn and obeys its rate bound', () => {
  const result = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
  assert.ok(Math.abs(result - (Math.PI - 0.05)) < 1e-8);
});
