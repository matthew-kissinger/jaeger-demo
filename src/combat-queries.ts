import type { Point } from './movement';

type Surface = { targetId?: string; material: string };
export type Cylinder = Surface & { shape: 'cylinder'; center: number[]; radius: number; halfDepth: number };
export type Box = Surface & { shape: 'box'; min: number[]; max: number[] };
export type Collider = Cylinder | Box;
export type Hit = Surface & { distance: number; point: Point; normal: Point };
const dot = (a: Point, b: Point) => a.x*b.x + a.y*b.y + a.z*b.z;
const subtract = (a: Point, b: Point) => ({ x:a.x-b.x, y:a.y-b.y, z:a.z-b.z });
const lerp = (a: Point, b: Point, t: number) => ({ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t });
const advance = (p: Point, d: Point, t: number) => ({ x:p.x+d.x*t, y:p.y+d.y*t, z:p.z+d.z*t });

/** Closed finite cylinder aligned with +X, matching the authored target discs. */
export function rayCylinder(origin: Point, direction: Point, cylinder: Cylinder): Hit | null {
  const p = { x:origin.x-cylinder.center[0], y:origin.y-cylinder.center[1], z:origin.z-cylinder.center[2] };
  let distance = Infinity, normal: Point = { x:0,y:0,z:0 };
  if (Math.abs(direction.x) > 1e-12) for (const sign of [-1,1]) {
    const t = (sign*cylinder.halfDepth-p.x)/direction.x;
    const y = p.y+direction.y*t, z=p.z+direction.z*t;
    if (t>=0 && t<distance && y*y+z*z<=cylinder.radius*cylinder.radius+1e-9) { distance=t; normal={x:sign,y:0,z:0}; }
  }
  const a=direction.y*direction.y+direction.z*direction.z;
  const b=2*(p.y*direction.y+p.z*direction.z), c=p.y*p.y+p.z*p.z-cylinder.radius*cylinder.radius, determinant=b*b-4*a*c;
  if (a>1e-12 && determinant>=0) for (const sign of [-1,1]) {
    const t=(-b+sign*Math.sqrt(determinant))/(2*a);
    if (t>=0 && t<distance && Math.abs(p.x+direction.x*t)<=cylinder.halfDepth+1e-9) {
      distance=t; normal={x:0,y:(p.y+direction.y*t)/cylinder.radius,z:(p.z+direction.z*t)/cylinder.radius};
    }
  }
  return Number.isFinite(distance) ? {distance,point:advance(origin,direction,distance),normal,targetId:cylinder.targetId,material:cylinder.material} : null;
}
function rayBox(origin: Point, direction: Point, box: Box): Hit | null {
  let entry=-Infinity, exit=Infinity, normal={x:0,y:0,z:0};
  for (const [axis,i] of [['x',0],['y',1],['z',2]] as const) {
    if (Math.abs(direction[axis])<1e-12) { if(origin[axis]<box.min[i] || origin[axis]>box.max[i]) return null; continue; }
    const a=(box.min[i]-origin[axis])/direction[axis], b=(box.max[i]-origin[axis])/direction[axis];
    if(Math.min(a,b)>entry) { entry=Math.min(a,b); normal={x:0,y:0,z:0}; normal[axis]=-Math.sign(direction[axis]); }
    exit=Math.min(exit,Math.max(a,b));
  }
  if(entry>exit || exit<0) return null;
  const distance=Math.max(0,entry);
  return {distance,point:advance(origin,direction,distance),normal,targetId:box.targetId,material:box.material};
}
export function traceWorld(origin: Point, direction: Point, colliders: Collider[], range: number): Hit | null {
  let nearest: Hit | null = null;
  for(const collider of colliders) {
    const hit=collider.shape==='cylinder'?rayCylinder(origin,direction,collider):rayBox(origin,direction,collider);
    if(hit && hit.distance<=range && (!nearest || hit.distance<nearest.distance)) nearest=hit;
  }
  return nearest;
}
function closestToCylinder(p: Point, cylinder: Cylinder) {
  const x=p.x-cylinder.center[0], y=p.y-cylinder.center[1], z=p.z-cylinder.center[2], radial=Math.hypot(y,z);
  const factor=radial>cylinder.radius?cylinder.radius/radial:1;
  const point={x:cylinder.center[0]+Math.max(-cylinder.halfDepth,Math.min(cylinder.halfDepth,x)),y:cylinder.center[1]+y*factor,z:cylinder.center[2]+z*factor};
  const delta=subtract(p,point), distance=Math.hypot(delta.x,delta.y,delta.z);
  return {distance,point,normal:distance>1e-10?{x:delta.x/distance,y:delta.y/distance,z:delta.z/distance}:{x:x<=0?-1:1,y:0,z:0}};
}
function segmentDistance(a: Point,b: Point,cylinder: Cylinder) {
  // Distance to a convex solid along a segment is convex. Search this single
  // coordinate, retaining endpoints for exactly parallel / stationary blades.
  let lo=0,hi=1;
  for(let i=0;i<28;i++) {
    const u=lo+(hi-lo)/3,v=hi-(hi-lo)/3;
    if(closestToCylinder(lerp(a,b,u),cylinder).distance<closestToCylinder(lerp(a,b,v),cylinder).distance) hi=v; else lo=u;
  }
  const results=[closestToCylinder(a,cylinder),closestToCylinder(b,cylinder),closestToCylinder(lerp(a,b,(lo+hi)/2),cylinder)];
  return results.reduce((best,next)=>next.distance<best.distance?next:best);
}
/** Continuous capsule sweep between two consecutive posed blade segments.
 * Conservative advancement uses the maximum endpoint travel as a speed bound.
 * A 0.1mm contact tolerance avoids an asymptote at a grazing contact. */
export function sweepBlade(previousBase: Point, previousTip: Point, base: Point, tip: Point, cylinder: Cylinder, radius: number) {
  const da=subtract(base,previousBase),db=subtract(tip,previousTip),speed=Math.sqrt(Math.max(dot(da,da),dot(db,db)));
  let fraction=0;
  for(let i=0;i<96;i++) {
    const result=segmentDistance(lerp(previousBase,base,fraction),lerp(previousTip,tip,fraction),cylinder);
    if(result.distance<=radius+1e-4) return {fraction,point:result.point,normal:result.normal};
    if(speed<1e-10) return null;
    fraction+=(result.distance-radius)/speed;
    if(fraction>1) return null;
  }
  return null;
}
