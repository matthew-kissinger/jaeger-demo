import * as THREE from 'three/webgpu';
import { attribute, float, length, max, pow, uv } from 'three/tsl';
const CAPACITY = 192;
export class Effects {
  readonly mesh: THREE.InstancedMesh; private cursor = 0;
  private particles = Array.from({ length: CAPACITY }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, maxLife: 1, size: 1 }));
  private opacity = new Float32Array(CAPACITY); private dummy = new THREE.Object3D(); private seed = 203;
  private ribbons: { mesh: THREE.Mesh; positions: Float32Array; alpha: Float32Array; ages: Float32Array; cursor: number }[] = [];
  private shots: { mesh: THREE.Mesh; life: number }[] = [];
  private shotCursor = 0;
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(this.opacity, 1));
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#73d9f9', side: THREE.DoubleSide });
    material.opacityNode = pow(max(float(0), float(1).sub(length(uv().sub(0.5)).mul(2))), 2).mul(attribute('aOpacity', 'float'));
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.mesh);
    for (let i = 0; i < CAPACITY; i++) { this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); }
    for(let side=0;side<2;side++) {
      const positions=new Float32Array(16*4*3),alpha=new Float32Array(16*4),ages=new Float32Array(16),indices=[];
      for(let i=0;i<16;i++){const j=i*4;indices.push(j,j+1,j+2,j+2,j+1,j+3);}
      const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('aOpacity',new THREE.BufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
      const material=new THREE.MeshBasicNodeMaterial({color:'#5ccfea',transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});material.opacityNode=attribute('aOpacity','float');
      const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);this.ribbons.push({mesh,positions,alpha,ages,cursor:0});
    }
    const streakGeometry=new THREE.CylinderGeometry(0.24,0.24,1,6),streakMaterial=new THREE.MeshBasicMaterial({color:'#b9f4ff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
    for(let i=0;i<4;i++){const mesh=new THREE.Mesh(streakGeometry,streakMaterial.clone());mesh.scale.setScalar(0);scene.add(mesh);this.shots.push({mesh,life:0});}
  }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  burst(point: THREE.Vector3, count = 14, size = 2, speed = 13) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor++ % CAPACITY]; p.p.copy(point); p.v.set((this.random() - 0.5) * speed, this.random() * speed, (this.random() - 0.5) * speed); p.life = p.maxLife = 0.2 + this.random() * 0.5; p.size = size * (0.5 + this.random());
    }
  }
  trail(point: THREE.Vector3, velocity: THREE.Vector3, size = 3) { const p = this.particles[this.cursor++ % CAPACITY]; p.p.copy(point); p.v.copy(velocity); p.life = p.maxLife = 0.25; p.size = size; }
  blade(side: 'R'|'L',oldBase: THREE.Vector3,oldTip: THREE.Vector3,base: THREE.Vector3,tip: THREE.Vector3) {
    const ribbon=this.ribbons[side==='R'?0:1],i=ribbon.cursor++%16;ribbon.ages[i]=0.18;
    const points=[oldBase,oldTip,base,tip];for(let j=0;j<4;j++)points[j].toArray(ribbon.positions,(i*4+j)*3);
    ribbon.mesh.geometry.getAttribute('position').needsUpdate=true;
  }
  shot(start:THREE.Vector3,end:THREE.Vector3){const s=this.shots[this.shotCursor++%4];s.life=.12;s.mesh.position.copy(start).lerp(end,.5);s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());s.mesh.scale.set(1,start.distanceTo(end),1);}
  update(dt: number, camera: THREE.Camera) {
    this.dummy.quaternion.copy(camera.quaternion);
    this.particles.forEach((p, i) => {
      p.life = Math.max(0, p.life - dt); p.p.addScaledVector(p.v, dt); p.v.y -= dt * 9;
      this.dummy.position.copy(p.p); this.dummy.scale.setScalar(p.life > 0 ? p.size * (1.2 - p.life / p.maxLife * 0.2) : 0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); this.opacity[i] = p.life / p.maxLife;
    }); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.geometry.getAttribute('aOpacity').needsUpdate = true;
    for(const ribbon of this.ribbons){for(let i=0;i<16;i++){ribbon.ages[i]=Math.max(0,ribbon.ages[i]-dt);const a=Math.pow(ribbon.ages[i]/.18,1.5);ribbon.alpha[i*4]=a*.05;ribbon.alpha[i*4+1]=a*.35;ribbon.alpha[i*4+2]=a*.12;ribbon.alpha[i*4+3]=a*.65;}ribbon.mesh.geometry.getAttribute('aOpacity').needsUpdate=true;}
    for(const shot of this.shots){shot.life=Math.max(0,shot.life-dt);(shot.mesh.material as THREE.MeshBasicMaterial).opacity=shot.life/.12;if(shot.life===0)shot.mesh.scale.setScalar(0);}
  }
  reset() { for (const p of this.particles) p.life = 0;for(const r of this.ribbons)r.ages.fill(0);for(const s of this.shots)s.life=0; }
}
