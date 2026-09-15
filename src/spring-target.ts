import * as THREE from 'three';

export interface SpringTargetConfig {
  omegaN: number;      // Natural frequency (rad/s): ~4.2 for heavy mech targets
  zeta: number;        // Damping ratio: ~0.40 for 2 visible oscillation cycles
  maxAngle: number;    // Hard angle limit (radians): ~0.45 (~26 deg)
  height: number;      // Effective lever arm height (meters)
  restitution: number; // Coefficient of restitution on bottoming out (~0.2)
}

export class ProceduralSpringTarget {
  // 2D horizontal tilt angle (in radians) around X and Z axes
  readonly tilt = new THREE.Vector2(0, 0);
  readonly velocity = new THREE.Vector2(0, 0);
  private readonly qTilt = new THREE.Quaternion();
  private readonly qInitial = new THREE.Quaternion();

  constructor(
    readonly root: THREE.Object3D,
    readonly config: SpringTargetConfig = {
      omegaN: 4.2,
      zeta: 0.40,
      maxAngle: 0.45,
      height: 60.0,
      restitution: 0.2,
    }
  ) {
    this.qInitial.copy(root.quaternion);
  }

  /**
   * Apply a hit impulse vector (in world space) at a contact point.
   */
  applyHit(impulse: THREE.Vector3, contactPoint?: THREE.Vector3) {
    const lever = contactPoint ? Math.max(10, contactPoint.y - this.root.position.y) : this.config.height;
    const normalizedLever = Math.min(1.5, lever / this.config.height);

    // Torque axis is perpendicular to impulse direction in XZ plane
    // An impulse along +X causes tilt around +Z (away from attacker)
    // An impulse along +Z causes tilt around -X
    const impulseZ = -impulse.x * normalizedLever;
    const impulseX =  impulse.z * normalizedLever;

    // Diminishing returns near maximum tilt limit to prevent spinning
    const currentAngle = this.tilt.length();
    const headroom = Math.max(0, 1 - currentAngle / this.config.maxAngle);

    this.velocity.x += impulseX * headroom;
    this.velocity.y += impulseZ * headroom;
  }

  update(dt: number) {
    if (dt <= 0) return;
    const { omegaN, zeta, maxAngle, restitution } = this.config;
    const k = omegaN * omegaN;
    const c = 2 * zeta * omegaN;

    // Sub-step to ensure unconditional stability even during frame drops
    const steps = Math.min(4, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      // Semi-implicit Euler integration (velocity first, then position)
      const accelX = -k * this.tilt.x - c * this.velocity.x;
      const accelY = -k * this.tilt.y - c * this.velocity.y;

      this.velocity.x += accelX * h;
      this.velocity.y += accelY * h;

      this.tilt.x += this.velocity.x * h;
      this.tilt.y += this.velocity.y * h;

      // Hard angle limit with restitution
      const angle = this.tilt.length();
      if (angle > maxAngle) {
        this.tilt.multiplyScalar(maxAngle / angle);
        const nx = this.tilt.x / maxAngle;
        const ny = this.tilt.y / maxAngle;
        const vDotN = this.velocity.x * nx + this.velocity.y * ny;
        if (vDotN > 0) {
          this.velocity.x -= (1 + restitution) * vDotN * nx;
          this.velocity.y -= (1 + restitution) * vDotN * ny;
        }
      }
    }

    // Convert tilt angles to rotation quaternion:
    // tilt.x tilts around X axis, tilt.y tilts around Z axis
    const angle = this.tilt.length();
    if (angle > 1e-5) {
      const axis = new THREE.Vector3(this.tilt.x / angle, 0, this.tilt.y / angle);
      this.qTilt.setFromAxisAngle(axis, angle);
      this.root.quaternion.copy(this.qInitial).multiply(this.qTilt);
    } else {
      this.root.quaternion.copy(this.qInitial);
    }
    this.root.updateMatrixWorld(true);
  }

  reset() {
    this.tilt.set(0, 0);
    this.velocity.set(0, 0);
    this.root.quaternion.copy(this.qInitial);
    this.root.updateMatrixWorld(true);
  }
}
