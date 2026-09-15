import * as THREE from 'three';

export class CameraShake {
  trauma = 0; // [0, 1]
  decay = 1.4; // Trauma loss per second
  maxPitch = 0.045; // Radians (~2.6 deg)
  maxYaw = 0.035;   // Radians (~2.0 deg)
  maxRoll = 0.025;  // Radians (~1.4 deg)
  maxOffset = 1.8;  // World units (meters)
  private time = 0;
  readonly offset = new THREE.Vector3();
  readonly rotation = new THREE.Euler(0, 0, 0, 'YXZ');

  addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  update(delta: number) {
    if (this.trauma <= 0) {
      this.offset.set(0, 0, 0);
      this.rotation.set(0, 0, 0);
      return;
    }

    this.time += delta * 24;
    const shake = this.trauma * this.trauma; // Non-linear response (trauma^2)

    this.offset.set(
      (Math.sin(this.time * 1.1) + Math.sin(this.time * 2.3)) * 0.5 * this.maxOffset * shake,
      (Math.cos(this.time * 1.3) + Math.cos(this.time * 2.7)) * 0.5 * this.maxOffset * shake,
      (Math.sin(this.time * 0.9) + Math.cos(this.time * 1.7)) * 0.5 * this.maxOffset * shake
    );

    this.rotation.set(
      Math.sin(this.time * 1.2) * this.maxPitch * shake,
      Math.cos(this.time * 1.4) * this.maxYaw * shake,
      Math.sin(this.time * 1.6) * this.maxRoll * shake
    );

    this.trauma = Math.max(0, this.trauma - this.decay * delta);
  }

  apply(camera: THREE.Camera) {
    if (this.trauma <= 0) return;
    camera.position.add(this.offset);
    camera.rotation.x += this.rotation.x;
    camera.rotation.y += this.rotation.y;
    camera.rotation.z += this.rotation.z;
  }
}
