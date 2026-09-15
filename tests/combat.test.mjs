import test from 'node:test';
import assert from 'node:assert/strict';
import { rayCylinder, sweepBlade, traceWorld } from '../src/combat-queries.ts';

const target = { shape: 'cylinder', center: [20, 10, 0], radius: 5, halfDepth: 1, targetId: 'target', material: 'steel' };
test('weapon rays hit the finite disc face or rim, never the empty sphere around it', () => {
  assert.equal(rayCylinder({x:0,y:10,z:0},{x:1,y:0,z:0},target).distance,19);
  assert.equal(rayCylinder({x:16,y:0,z:0},{x:0,y:1,z:0},target),null);
  const rim = rayCylinder({x:20,y:0,z:0},{x:0,y:1,z:0},target);
  assert.equal(rim.distance,5); assert.deepEqual(rim.normal,{x:0,y:-1,z:0});
  assert.equal(rayCylinder({x:0,y:16,z:0},{x:1,y:0,z:0},target),null);
});
test('the nearest obstruction masks a target behind it', () => {
  const wall = { shape:'box', min:[10,0,-10], max:[11,30,10], material:'concrete' };
  const hit = traceWorld({x:0,y:10,z:0},{x:1,y:0,z:0},[target,wall],100);
  assert.equal(hit.targetId,undefined); assert.equal(hit.distance,10);
  assert.equal(traceWorld({x:0,y:10,z:0},{x:-1,y:0,z:0},[target,wall],100),null);
});
test('a blade crossing a thin disc between poses cannot tunnel and clear sweeps miss', () => {
  const a={x:15,y:10,z:-4},b={x:15,y:10,z:4},c={x:25,y:10,z:-4},d={x:25,y:10,z:4};
  const hit=sweepBlade(a,b,c,d,target,.2);
  assert.ok(hit && hit.fraction>.37 && hit.fraction<.39);
  assert.ok(Math.abs(hit.point.x-19)<.001);
  assert.equal(sweepBlade({...a,y:16},{...b,y:16},{...c,y:16},{...d,y:16},target,.2),null);
  assert.equal(sweepBlade(a,b,a,b,target,.2),null);
});
