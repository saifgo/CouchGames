/**
 * Gyro → analog stick ("tilt to steer / aim"). Uses device orientation relative
 * to a calibration pose captured when gyro mode is enabled (or recalibrated).
 * Landscape-aware: tilting the phone like a steering wheel moves X, tipping it
 * toward / away from you moves Y.
 */
export type GyroOutput = (x: number, y: number, raw: { gx: number; gy: number; gz: number }) => void;

export async function requestMotionPermission(): Promise<boolean> {
  const DME = (globalThis as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (DME?.requestPermission) {
    try {
      return (await DME.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return typeof DeviceOrientationEvent !== 'undefined';
}

export class Gyro {
  private base: { beta: number; gamma: number } | null = null;
  private running = false;
  sensitivity = 1;
  private readonly onOrient = (e: DeviceOrientationEvent) => this.orient(e);
  private readonly onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate;
    if (r) this.raw = { gx: Math.round((r.alpha ?? 0) * 16), gy: Math.round((r.beta ?? 0) * 16), gz: Math.round((r.gamma ?? 0) * 16) };
  };
  private raw = { gx: 0, gy: 0, gz: 0 };

  constructor(private readonly out: GyroOutput) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.base = null;
    window.addEventListener('deviceorientation', this.onOrient);
    window.addEventListener('devicemotion', this.onMotion);
  }

  stop(): void {
    this.running = false;
    window.removeEventListener('deviceorientation', this.onOrient);
    window.removeEventListener('devicemotion', this.onMotion);
    this.out(0, 0, { gx: 0, gy: 0, gz: 0 });
  }

  recalibrate(): void {
    this.base = null;
  }

  private orient(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    // In landscape the axes swap; screen.orientation.angle is 90 or 270 (−90).
    const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 90) as number;
    const flip = angle === 270 || angle === -90 ? -1 : 1;
    const steer = e.beta * flip; // rotate like a wheel
    const pitch = -e.gamma * flip; // tip toward / away
    if (!this.base) this.base = { beta: steer, gamma: pitch };
    const fullTiltDeg = 35 / this.sensitivity;
    const clamp = (v: number) => Math.max(-127, Math.min(127, Math.round(v)));
    let x = ((steer - this.base.beta) / fullTiltDeg) * 127;
    let y = ((pitch - this.base.gamma) / fullTiltDeg) * 127;
    // Small dead zone so a resting phone sends 0.
    if (Math.abs(x) < 8) x = 0;
    if (Math.abs(y) < 8) y = 0;
    this.out(clamp(x), clamp(y), this.raw);
  }
}
