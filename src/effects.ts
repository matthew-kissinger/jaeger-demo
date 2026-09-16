import * as THREE from 'three/webgpu';
import { attribute, float, length, max, pow, uv } from 'three/tsl';

const CAPACITY = 1536;
const SHOCKWAVE_COUNT = 8;

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  r: number; g: number; b: number;
  endR: number; endG: number; endB: number;
  drag: number;
  gravity: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  active: boolean;
  time: number;
  maxTime: number;
  maxRadius: number;
  center: THREE.Vector3;
}

interface RocketShot {
  mesh: THREE.Mesh;
  active: boolean;
  start: THREE.Vector3;
  end: THREE.Vector3;
  dir: THREE.Vector3;
  totalDist: number;
  currentDist: number;
  speed: number;
}

export class Effects {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private particles: Particle[] = Array.from({ length: CAPACITY }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    life: 0,
    maxLife: 1,
    startSize: 1,
    endSize: 1,
    r: 1, g: 1, b: 1,
    endR: 1, endG: 1, endB: 1,
    drag: 0,
    gravity: 0
  }));
  private opacity = new Float32Array(CAPACITY);
  private colors = new Float32Array(CAPACITY * 3);
  private dummy = new THREE.Object3D();
  private seed = 203;

  private ribbons: { mesh: THREE.Mesh; positions: Float32Array; alpha: Float32Array; ages: Float32Array; cursor: number }[] = [];
  private shockwaves: Shockwave[] = [];
  private shockwaveCursor = 0;
  private rocketShots: RocketShot[] = [];
  private rocketCursor = 0;

  constructor(scene: THREE.Scene) {
    // 1. Instanced Quad Particle System with TSL Node Material
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(this.opacity, 1));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.colors, 3));

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    material.colorNode = attribute('aColor', 'vec3');
    material.opacityNode = pow(max(float(0), float(1).sub(length(uv().sub(0.5)).mul(2))), 2).mul(attribute('aOpacity', 'float'));

    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    for (let i = 0; i < CAPACITY; i++) {
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.colors[i * 3] = 1;
      this.colors[i * 3 + 1] = 1;
      this.colors[i * 3 + 2] = 1;
    }
    this.mesh.geometry.getAttribute('aColor').needsUpdate = true;

    // 2. Blade Slash Ribbons (Preserve existing melee combat trails)
    for (let side = 0; side < 2; side++) {
      const positions = new Float32Array(16 * 4 * 3), alpha = new Float32Array(16 * 4), ages = new Float32Array(16), indices = [];
      for (let i = 0; i < 16; i++) { const j = i * 4; indices.push(j, j + 1, j + 2, j + 2, j + 1, j + 3); }
      const ribbonGeo = new THREE.BufferGeometry();
      ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      ribbonGeo.setAttribute('aOpacity', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
      ribbonGeo.setIndex(indices);
      const ribbonMat = new THREE.MeshBasicNodeMaterial({ color: '#5ccfea', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      ribbonMat.opacityNode = attribute('aOpacity', 'float');
      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbonMesh.frustumCulled = false;
      scene.add(ribbonMesh);
      this.ribbons.push({ mesh: ribbonMesh, positions, alpha, ages, cursor: 0 });
    }

    // 3. Expanding Shockwave Rings
    const ringGeo = new THREE.RingGeometry(0.86, 1.0, 36);
    for (let i = 0; i < SHOCKWAVE_COUNT; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#ffaa44',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2; // Flat on ground
      ringMesh.scale.setScalar(0);
      ringMesh.frustumCulled = false;
      scene.add(ringMesh);
      this.shockwaves.push({ mesh: ringMesh, active: false, time: 0, maxTime: 0.45, maxRadius: 35, center: new THREE.Vector3() });
    }

    // 4. Traveling Rocket Missile Meshes
    const rocketGeo = new THREE.CylinderGeometry(0.7, 0.95, 4.5, 8);
    rocketGeo.rotateX(Math.PI / 2); // Align forward along +Z
    const rocketMat = new THREE.MeshBasicMaterial({
      color: '#ffe588',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(rocketGeo, rocketMat.clone());
      mesh.scale.setScalar(0);
      scene.add(mesh);
      this.rocketShots.push({
        mesh,
        active: false,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        totalDist: 0,
        currentDist: 0,
        speed: 750
      });
    }
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * General particle burst with color transitions and physics
   */
  burst(point: THREE.Vector3, count = 14, size = 2, speed = 13, r = 0.45, g = 0.85, b = 1.0) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor++ % CAPACITY];
      p.p.copy(point);
      p.v.set((this.random() - 0.5) * speed, (this.random() * 0.75 + 0.1) * speed, (this.random() - 0.5) * speed);
      p.life = p.maxLife = 0.25 + this.random() * 0.45;
      p.startSize = size * (0.6 + this.random() * 0.8);
      p.endSize = p.startSize * (0.2 + this.random() * 0.4);
      p.r = r; p.g = g; p.b = b;
      p.endR = r * 0.5; p.endG = g * 0.4; p.endB = b * 0.4;
      p.drag = 1.8;
      p.gravity = 14;
    }
  }

  /**
   * Jet thruster / rocket exhaust particle trail
   */
  trail(point: THREE.Vector3, velocity: THREE.Vector3, size = 3, r = 0.4, g = 0.88, b = 1.0, life = 0.28) {
    const p = this.particles[this.cursor++ % CAPACITY];
    p.p.copy(point);
    p.v.copy(velocity);
    p.life = p.maxLife = life;
    p.startSize = size;
    p.endSize = size * 1.5;
    p.r = r; p.g = g; p.b = b;
    p.endR = r * 0.4; p.endG = g * 0.2; p.endB = b * 0.2;
    p.drag = 1.2;
    p.gravity = 0;
  }

  /**
   * Expanding smoke puff that rises and slows down
   */
  smoke(point: THREE.Vector3, velocity: THREE.Vector3, startSize = 6, endSize = 22, life = 1.2, r = 0.22, g = 0.25, b = 0.28) {
    const p = this.particles[this.cursor++ % CAPACITY];
    p.p.copy(point);
    p.v.copy(velocity);
    p.life = p.maxLife = life;
    p.startSize = startSize;
    p.endSize = endSize;
    p.r = r; p.g = g; p.b = b;
    p.endR = r * 0.6; p.endG = g * 0.6; p.endB = b * 0.6;
    p.drag = 2.2;
    p.gravity = -4.0; // floats upward gently
  }

  /**
   * Spawns an expanding ground or aerial shockwave ring
   */
  shockwave(center: THREE.Vector3, maxRadius = 35, duration = 0.42, color = '#ff9933') {
    const sw = this.shockwaves[this.shockwaveCursor++ % SHOCKWAVE_COUNT];
    sw.active = true;
    sw.time = 0;
    sw.maxTime = duration;
    sw.maxRadius = maxRadius;
    sw.center.copy(center);
    sw.mesh.position.copy(center).setY(center.y + 0.3);
    (sw.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    sw.mesh.scale.setScalar(0.01);
  }

  /**
   * Massive cinematic explosion with expanding fireball, shockwave ring,
   * high-speed ballistic sparks, and rising volumetric smoke clouds
   */
  explosion(point: THREE.Vector3, scale = 1.0) {
    // 1. Ground / air shockwave ring
    this.shockwave(point, 38 * scale, 0.45, '#ffaa44');

    // 2. White-hot to orange fireball core (35 particles)
    for (let i = 0; i < 35; i++) {
      const p = this.particles[this.cursor++ % CAPACITY];
      p.p.copy(point).add(new THREE.Vector3((this.random() - 0.5) * 3, (this.random() - 0.5) * 3, (this.random() - 0.5) * 3));
      const speed = (18 + this.random() * 26) * scale;
      p.v.set((this.random() - 0.5) * speed, (this.random() * 0.8 + 0.2) * speed, (this.random() - 0.5) * speed);
      p.life = p.maxLife = (0.35 + this.random() * 0.35);
      p.startSize = (6 + this.random() * 8) * scale;
      p.endSize = (20 + this.random() * 16) * scale;
      // White-hot shifting to intense fire orange
      p.r = 1.8; p.g = 1.4; p.b = 0.6;
      p.endR = 0.95; p.endG = 0.22; p.endB = 0.02;
      p.drag = 3.2;
      p.gravity = -8; // buoyant thermal lift
    }

    // 3. High-velocity fiery sparks / shrapnel (40 particles)
    for (let i = 0; i < 40; i++) {
      const p = this.particles[this.cursor++ % CAPACITY];
      p.p.copy(point);
      const speed = (35 + this.random() * 45) * scale;
      const theta = this.random() * Math.PI * 2;
      const phi = this.random() * Math.PI * 0.45; // upward hemisphere
      p.v.set(Math.cos(theta) * Math.sin(phi) * speed, Math.cos(phi) * speed, Math.sin(theta) * Math.sin(phi) * speed);
      p.life = p.maxLife = 0.4 + this.random() * 0.5;
      p.startSize = (1.8 + this.random() * 2.2) * scale;
      p.endSize = 0.3;
      p.r = 1.6; p.g = 1.1; p.b = 0.3;
      p.endR = 0.9; p.endG = 0.35; p.endB = 0.05;
      p.drag = 0.6;
      p.gravity = 28; // heavy downward ballistic arc
    }

    // 4. Dark volumetric smoke cloud (30 particles)
    for (let i = 0; i < 30; i++) {
      const p = this.particles[this.cursor++ % CAPACITY];
      p.p.copy(point).add(new THREE.Vector3((this.random() - 0.5) * 6 * scale, this.random() * 3 * scale, (this.random() - 0.5) * 6 * scale));
      const speed = (6 + this.random() * 14) * scale;
      p.v.set((this.random() - 0.5) * speed, (this.random() * 0.6 + 0.3) * speed, (this.random() - 0.5) * speed);
      p.life = p.maxLife = 1.0 + this.random() * 0.8;
      p.startSize = (8 + this.random() * 10) * scale;
      p.endSize = (28 + this.random() * 18) * scale;
      p.r = 0.18; p.g = 0.20; p.b = 0.24;
      p.endR = 0.08; p.endG = 0.09; p.endB = 0.11;
      p.drag = 2.4;
      p.gravity = -5.0; // rising smoke
    }
  }

  /**
   * Takeoff blast: massive dust and flame shockwave at feet
   */
  takeoffBlast(groundPoint: THREE.Vector3) {
    this.shockwave(groundPoint, 42, 0.45, '#73d9f9');
    this.shockwave(groundPoint, 32, 0.55, '#ffaa44');
    for (let i = 0; i < 45; i++) {
      const p = this.particles[this.cursor++ % CAPACITY];
      p.p.copy(groundPoint).setY(groundPoint.y + 0.5);
      const angle = this.random() * Math.PI * 2;
      const speed = 25 + this.random() * 35;
      p.v.set(Math.cos(angle) * speed, 2 + this.random() * 12, Math.sin(angle) * speed);
      p.life = p.maxLife = 0.6 + this.random() * 0.6;
      p.startSize = 6 + this.random() * 8;
      p.endSize = 22 + this.random() * 14;
      if (this.random() > 0.4) {
        // Cyan-white plasma dust
        p.r = 0.6; p.g = 1.2; p.b = 1.5;
        p.endR = 0.2; p.endG = 0.4; p.endB = 0.6;
      } else {
        // Fire burst
        p.r = 1.5; p.g = 0.7; p.b = 0.1;
        p.endR = 0.4; p.endG = 0.1; p.endB = 0.02;
      }
      p.drag = 2.0;
      p.gravity = 5;
    }
  }

  /**
   * Sleek, high-intensity plasma jet exhaust from twin back nozzles.
   * Tight, luminous cyan/electric-blue streaming backward so the robot's body is never obscured.
   */
  thrusterPlume(socketPos: THREE.Vector3, thrustDir: THREE.Vector3, scale = 1.0) {
    for (let i = 0; i < 2; i++) {
      const spread = new THREE.Vector3((this.random() - 0.5) * 0.9, (this.random() - 0.5) * 0.9, (this.random() - 0.5) * 0.9);
      const vel = thrustDir.clone().multiplyScalar((28 + this.random() * 14) * scale).add(spread.multiplyScalar(2));
      this.trail(socketPos.clone().add(spread), vel, (5.2 + this.random() * 2.2) * scale, 0.65, 0.95, 1.35, 0.22);
    }
  }

  blade(side: 'R' | 'L', oldBase: THREE.Vector3, oldTip: THREE.Vector3, base: THREE.Vector3, tip: THREE.Vector3) {
    const ribbon = this.ribbons[side === 'R' ? 0 : 1], i = ribbon.cursor++ % 16;
    ribbon.ages[i] = 0.18;
    const points = [oldBase, oldTip, base, tip];
    for (let j = 0; j < 4; j++) points[j].toArray(ribbon.positions, (i * 4 + j) * 3);
    ribbon.mesh.geometry.getAttribute('position').needsUpdate = true;
  }

  /**
   * Launch high-speed rocket projectile with bright glowing missile and smoke trail
   */
  shot(start: THREE.Vector3, end: THREE.Vector3) {
    const r = this.rocketShots[this.rocketCursor++ % 6];
    r.active = true;
    r.start.copy(start);
    r.end.copy(end);
    r.totalDist = start.distanceTo(end);
    r.currentDist = 0;
    r.dir.copy(end).sub(start).normalize();
    r.mesh.position.copy(start);
    r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.dir);
    r.mesh.scale.set(1.4, 1.4, 1.4);
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1.0;

    // Cannon muzzle flash
    this.burst(start, 18, 5, 18, 1.8, 1.2, 0.4);
  }

  update(dt: number, camera: THREE.Camera) {
    this.dummy.quaternion.copy(camera.quaternion);

    // Update Particles
    for (let i = 0; i < CAPACITY; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life = Math.max(0, p.life - dt);
        const t = 1 - p.life / p.maxLife; // 0 to 1

        p.v.multiplyScalar(Math.exp(-dt * p.drag));
        p.v.y -= dt * p.gravity;
        p.p.addScaledVector(p.v, dt);

        const currentSize = p.startSize + (p.endSize - p.startSize) * t;
        this.dummy.position.copy(p.p);
        this.dummy.scale.setScalar(currentSize);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);

        this.opacity[i] = Math.pow(1 - t, 1.4);

        // Color interpolation over lifetime
        this.colors[i * 3] = p.r + (p.endR - p.r) * t;
        this.colors[i * 3 + 1] = p.g + (p.endG - p.g) * t;
        this.colors[i * 3 + 2] = p.b + (p.endB - p.b) * t;
      } else {
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.opacity[i] = 0;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.getAttribute('aOpacity').needsUpdate = true;
    this.mesh.geometry.getAttribute('aColor').needsUpdate = true;

    // Update Shockwave Rings
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.time += dt;
      const progress = sw.time / sw.maxTime;
      if (progress >= 1) {
        sw.active = false;
        sw.mesh.scale.setScalar(0);
        (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      } else {
        const radius = sw.maxRadius * Math.sin(progress * (Math.PI / 2));
        sw.mesh.scale.set(radius, radius, radius);
        (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress * progress) * 0.95;
      }
    }

    // Update Traveling Rockets
    for (const r of this.rocketShots) {
      if (!r.active) continue;
      r.currentDist += r.speed * dt;
      if (r.currentDist >= r.totalDist) {
        r.active = false;
        r.mesh.scale.setScalar(0);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      } else {
        r.mesh.position.copy(r.start).addScaledVector(r.dir, r.currentDist);
        // Rocket exhaust trail in flight
        const tail = r.mesh.position.clone().addScaledVector(r.dir, -2.5);
        this.trail(tail, r.dir.clone().multiplyScalar(-30), 4.5, 1.6, 1.1, 0.3, 0.15);
        this.smoke(tail, new THREE.Vector3((this.random() - 0.5) * 4, 1, (this.random() - 0.5) * 4), 3, 12, 0.45, 0.3, 0.32, 0.36);
      }
    }

    // Update Blade Ribbons
    for (const ribbon of this.ribbons) {
      for (let i = 0; i < 16; i++) {
        ribbon.ages[i] = Math.max(0, ribbon.ages[i] - dt);
        const a = Math.pow(ribbon.ages[i] / 0.18, 1.5);
        ribbon.alpha[i * 4] = a * 0.05;
        ribbon.alpha[i * 4 + 1] = a * 0.35;
        ribbon.alpha[i * 4 + 2] = a * 0.12;
        ribbon.alpha[i * 4 + 3] = a * 0.65;
      }
      ribbon.mesh.geometry.getAttribute('aOpacity').needsUpdate = true;
    }
  }

  reset() {
    for (const p of this.particles) p.life = 0;
    for (const r of this.ribbons) r.ages.fill(0);
    for (const s of this.shockwaves) { s.active = false; s.mesh.scale.setScalar(0); }
    for (const r of this.rocketShots) { r.active = false; r.mesh.scale.setScalar(0); }
  }
}
