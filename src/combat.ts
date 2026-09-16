import * as THREE from 'three/webgpu';
import { sweepBlade, traceWorld, type Collider, type Cylinder, type Hit } from './combat-queries.ts';
import type { Site, PoseFrame } from './player';
export type Side = 'R' | 'L';
export type Interaction = {
  targetMaterial: string; feedbackCooldown: number;
  targetDiscs: { offsetX: number; halfDepth: number; radiusAt13: number }[];
  weapons: { cannonRange: number; bladeRadius: number; cannonEvents: {time:number;side:Side}[]; bladeWindows: Record<string, {start:number;end:number;sound:number;sides:Side[]}[]> };
};
type BladePose = { base: THREE.Vector3; tip: THREE.Vector3 };
export type Shot = { side: Side; start: THREE.Vector3; direction: THREE.Vector3; end: THREE.Vector3; hit: Hit | null };
export class Combat {
  readonly colliders: Collider[] = []; private discs: Cylinder[] = [];
  private previous = new Map<Side,BladePose>(); private actionId = -1; private struck = new Set<string>();
  private sockets = new Map<string,THREE.Object3D>(); private cooldown = new Map<string,number>(); private time = 0;
  readonly shots: {side:Side;actionId:number;clipTime:number;targetId?:string;start:number[];end:number[]}[] = [];
  readonly hits: {targetId:string;actionId:number;strike:string;point:number[]}[] = [];
  onShot: (shot: Shot) => void = () => {};
  onImpact: (hit: Hit) => void = () => {};
  onTrail: (side: Side, previous: BladePose, current: BladePose) => void = () => {};
  onSwing: (position: THREE.Vector3) => void = () => {};
  model: THREE.Object3D;
  site: Site;
  config: Interaction;
  constructor(model: THREE.Object3D, site: Site, config: Interaction) {
    this.model = model; this.site = site; this.config = config;
    for(const name of ['MuzzleSocket','BladeSocket','BladeTipSocket']) for(const side of ['R','L']) {
      const node=model.getObjectByName(`Joint_${name}_${side}`); if(!node) throw new Error(`Missing weapon socket ${name}_${side}`); this.sockets.set(`${name}_${side}`,node);
    }
    for(const obstacle of site.obstacles) this.colliders.push({shape:'box',min:obstacle.min,max:obstacle.max,material:'concrete'});
    // Movement and weapon masks differ: blades can reach the target face while
    // their body remains outside the target's movement proxy. Supports block rays.
    for(const target of site.targets) {
      for(const disc of config.targetDiscs) {
        const shape: Cylinder={shape:'cylinder',center:[target.center[0]+disc.offsetX,target.center[1],target.center[2]],radius:disc.radiusAt13*target.radius/13,halfDepth:disc.halfDepth,targetId:target.id,material:config.targetMaterial};
        this.discs.push(shape); this.colliders.push(shape);
      }
      this.colliders.push({shape:'box',min:[target.position[0]-2,2,target.position[2]-2.5],max:[target.position[0]+2,target.center[1],target.position[2]+2.5],material:config.targetMaterial});
      this.colliders.push({shape:'box',min:[target.position[0]-11,0,target.position[2]-11],max:[target.position[0]+11,3,target.position[2]+11],material:'concrete'});
    }
    const deckMin = site.deck?.min ?? [-240, -6, -200], deckMax = site.deck?.max ?? [720, 0, 200];
    this.colliders.push({shape:'box',min:deckMin,max:deckMax,material:'concrete'});
  }
  reset() { this.actionId=-1; this.previous.clear(); this.struck.clear(); this.cooldown.clear(); this.shots.length=this.hits.length=0; this.time=0; }
  private point(name: string) { return this.sockets.get(name)!.getWorldPosition(new THREE.Vector3()); }
  currentTargetPoint?: THREE.Vector3;
  aim(side: Side, targetPoint?: THREE.Vector3): Shot {
    const node=this.sockets.get('MuzzleSocket_'+side)!,start=node.getWorldPosition(new THREE.Vector3());
    const target = targetPoint ?? this.currentTargetPoint;
    const direction = target ? target.clone().sub(start).normalize() : new THREE.Vector3(1,0,0).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const hit=traceWorld(start,direction,this.colliders,this.config.weapons.cannonRange),end=start.clone().addScaledVector(direction,hit?.distance??this.config.weapons.cannonRange);
    return {side,start,direction,end,hit};
  }
  private impact(hit: Hit, strike: string, id: number) {
    if(hit.targetId) {
      if((this.cooldown.get(hit.targetId)??-Infinity)>this.time) return;
      this.cooldown.set(hit.targetId,this.time+this.config.feedbackCooldown);
      this.hits.push({targetId:hit.targetId,actionId:id,strike,point:[hit.point.x,hit.point.y,hit.point.z]}); if(this.hits.length>64) this.hits.shift();
    }
    this.onImpact(hit);
  }
  update(frame: PoseFrame, dt: number) {
    this.time+=dt;
    if(frame.actionId!==this.actionId) { this.actionId=frame.actionId; this.previous.clear(); this.struck.clear(); }
    if((frame.state==='fire' || frame.state==='air-fire') && frame.clip==='CannonFire') for(const event of this.config.weapons.cannonEvents) {
      const key=`cannon-${event.side}`;
      if(frame.previousTime<event.time-1e-8 && frame.time>=event.time-1e-8 && !this.struck.has(key)) {
        this.struck.add(key); const shot=this.aim(event.side); this.onShot(shot);
        this.shots.push({side:event.side,actionId:frame.actionId,clipTime:frame.time,targetId:shot.hit?.targetId,start:shot.start.toArray(),end:shot.end.toArray()}); if(this.shots.length>64) this.shots.shift();
        if(shot.hit) this.impact(shot.hit,key,frame.actionId);
      }
    }
    const windows=(frame.state==='attack' || frame.state==='air-attack')?this.config.weapons.bladeWindows[frame.clip]??[]:[];
    for(const side of ['R','L'] as const) {
      const current={base:this.point('BladeSocket_'+side),tip:this.point('BladeTipSocket_'+side)},previous=this.previous.get(side)??current;
      for(const [index,window] of windows.entries()) {
        if(!window.sides.includes(side)) continue;
        if(frame.previousTime<window.sound && frame.time>=window.sound && side===window.sides[0]) this.onSwing(current.base);
        if(frame.time<window.start || frame.previousTime>window.end) continue;
        const delta=frame.time-frame.previousTime;
        const lo=delta>0?Math.max(0,(window.start-frame.previousTime)/delta):0,hi=delta>0?Math.min(1,(window.end-frame.previousTime)/delta):1;
        const from={base:previous.base.clone().lerp(current.base,lo),tip:previous.tip.clone().lerp(current.tip,lo)},to={base:previous.base.clone().lerp(current.base,hi),tip:previous.tip.clone().lerp(current.tip,hi)};
        this.onTrail(side,from,to);
        const contacts=new Map<string,{hit:Hit;fraction:number}>();
        for(const disc of this.discs) {
          const key=`blade-${index}-${disc.targetId}`; if(this.struck.has(key)) continue;
          const hit=sweepBlade(from.base,from.tip,to.base,to.tip,disc,this.config.weapons.bladeRadius);
          if(hit && (!contacts.has(disc.targetId!) || hit.fraction<contacts.get(disc.targetId!)!.fraction)) contacts.set(disc.targetId!,{fraction:hit.fraction,hit:{distance:0,point:hit.point,normal:hit.normal,targetId:disc.targetId,material:disc.material}});
        }
        for(const [targetId,result] of contacts) { const key=`blade-${index}-${targetId}`; this.struck.add(key); this.impact(result.hit,key,frame.actionId); }
      }
      this.previous.set(side,current);
    }
  }
}
