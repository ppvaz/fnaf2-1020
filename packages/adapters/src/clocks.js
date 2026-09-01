/** Injected monotonic/logical clocks; scheduling never calls wall time directly. */
import { ClockPort } from '@fnaf2-1020/core/timing';

export class Clock extends ClockPort {
  constructor({ name, read }) {
    super();
    if (typeof name !== 'string' || typeof read !== 'function') throw new TypeError('clock needs a name and read function');
    this.name = name; this.read = read;
  }
  now() {
    const value = this.read();
    if (!Number.isFinite(value) || value < 0) throw new Error(`${this.name} returned an invalid time`);
    return { clock: this.name, value };
  }
}
