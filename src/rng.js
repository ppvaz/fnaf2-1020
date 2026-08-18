// Seeded RNG so a run can be replayed, and so "worst luck" mode can pin every
// roll to the value that hurts most.
export class Rng {
  constructor(seed = Date.now() >>> 0, worst = false) {
    this.seed = seed >>> 0;
    this.state = this.seed || 1;
    this.worst = worst;
  }
  next() {
    // xorshift32
    let x = this.state;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    this.state = x;
    return x / 4294967296;
  }
  // chance(p): does this roll succeed? In worst-luck mode the animatronic
  // always gets what it wants.
  chance(p, worstIs = true) {
    const r = this.next() < p;
    return this.worst ? worstIs : r;
  }
  int(min, max, worstIs = null) {
    const v = min + Math.floor(this.next() * (max - min + 1));
    return this.worst && worstIs !== null ? worstIs : v;
  }
}
