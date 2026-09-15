export class PilotInput {
  keys = new Set<string>(); forward = 0; right = 0; yaw = 0; pitch = -0.12; zoom = 126;
  boost = false; onAction: (action: string) => void = () => {};
  private pointers = new Map<number, { x: number; y: number; kind: string; startX: number; startY: number }>();
  get isLocked() { return document.pointerLockElement === this.canvas; }
  shoulderSwap = false;
  canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('click', () => {
      if (!this.isLocked && window.matchMedia('(pointer: fine)').matches) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', event => {
      if (document.pointerLockElement === canvas) {
        this.yaw += event.movementX * 0.0028;
        this.pitch = Math.max(-0.75, Math.min(1.08, this.pitch - event.movementY * 0.0022));
      }
    });
    let initialPinchDist = 0, initialZoom = 126;
    canvas.addEventListener('pointerdown', event => {
      if (event.button === 1) { event.preventDefault(); this.shoulderSwap = !this.shoulderSwap; return; }
      if (event.button !== 0 && event.pointerType === 'mouse') return; canvas.focus();
      if (!this.isLocked) {
        canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, kind: 'look' });
        if (this.pointers.size === 2) {
          const [a, b] = Array.from(this.pointers.values());
          initialPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
          initialZoom = this.zoom;
        }
      }
    });
    canvas.addEventListener('pointermove', event => {
      if (this.isLocked) return;
      const p = this.pointers.get(event.pointerId); if (!p) return;
      if (this.pointers.size >= 2) {
        p.x = event.clientX; p.y = event.clientY;
        const [a, b] = Array.from(this.pointers.values());
        const currentDist = Math.hypot(a.x - b.x, a.y - b.y);
        if (initialPinchDist > 5) {
          const delta = initialPinchDist - currentDist;
          this.zoom = Math.max(70, Math.min(205, initialZoom + delta * 0.45));
        }
        return;
      }
      this.yaw += (event.clientX - p.x) * 0.0035;
      this.pitch = Math.max(-0.75, Math.min(1.08, this.pitch - (event.clientY - p.y) * 0.0028));
      p.x = event.clientX; p.y = event.clientY;
    });
    for (const name of ['pointerup','pointercancel'] as const) canvas.addEventListener(name, event => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 1) {
        // Prevent single touch delta jump after pinch release
        const remaining = Array.from(this.pointers.values())[0];
        remaining.x = event.clientX; remaining.y = event.clientY;
      }
    });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom = Math.max(70, Math.min(205, this.zoom + event.deltaY * 0.05)); }, { passive: false });
    window.addEventListener('keydown', event => {
      if ((event.target as HTMLElement).matches('input,select,textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code); if (event.repeat) return;
      const actions: Record<string, string> = { KeyQ: 'slash', KeyE: 'cannon', Space: 'boost', KeyR: 'reset', Escape: 'menu', KeyB: 'brake' };
      if (event.code === 'Space') this.boost = true;
      if (actions[event.code]) this.onAction(actions[event.code]);
    });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); if (event.code === 'Space') this.boost = false; });
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('orientationchange', () => this.clear());
    const pad = document.querySelector<HTMLElement>('#joystick')!, knob = pad.firstElementChild as HTMLElement;
    let pointer = -1;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const rect = pad.getBoundingClientRect(), x = (event.clientX - rect.left - rect.width / 2) / 42, y = (event.clientY - rect.top - rect.height / 2) / 42;
      const length = Math.max(1, Math.hypot(x, y)); this.right = x / length; this.forward = -y / length;
      knob.style.transform = `translate(${this.right * 35}px,${-this.forward * 35}px)`;
    };
    pad.addEventListener('pointerdown', event => { pointer = event.pointerId; pad.setPointerCapture(pointer); move(event); });
    pad.addEventListener('pointermove', move);
    for (const name of ['pointerup','pointercancel','lostpointercapture'] as const) pad.addEventListener(name, () => { pointer = -1; this.forward = this.right = 0; knob.style.transform = ''; });
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.action!;
      if (action === 'toggle-boost') { this.boost = !this.boost; if (this.boost) this.onAction('boost'); }
      else this.onAction(action);
    }));
  }
  movement() { return { forward: this.forward + Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')), right: this.right + Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) }; }
  clear() { this.keys.clear(); this.forward = this.right = 0; this.boost = false; this.pointers.clear(); }
}
