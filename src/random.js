const TWO_TO_32 = 4294967296;

/** splitmix32 step: a strong 32-bit mixer, used to expand seeds into generator state. */
function splitmix32(state) {
  let z = (state + 0x9e3779b9) >>> 0;
  const next = z;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return { next, value: (z ^ (z >>> 16)) >>> 0 };
}

/**
 * Reproducible sfc32 stream (period ≥ 2^32, typically ~2^127), seeded through splitmix32
 * so that nearby integer seeds give unrelated streams. Not suitable for cryptography.
 */
export class Random {
  constructor(seed = 1) {
    if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
    let s = seed >>> 0;
    const words = [];
    for (let i = 0; i < 4; i++) {
      const step = splitmix32(s);
      s = step.next;
      words.push(step.value);
    }
    [this.a, this.b, this.c, this.d] = words;
    this.spare = null;
    // Discard the first outputs, as recommended for sfc32.
    for (let i = 0; i < 12; i++) this.uint32();
  }

  /** Next raw 32-bit unsigned integer. */
  uint32() {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Uniform in the open interval (0, 1). */
  uniform() {
    return (this.uint32() + 0.5) / TWO_TO_32;
  }

  /** Standard normal via Box–Muller; the second variate of each pair is cached. */
  normal() {
    if (this.spare !== null) {
      const z = this.spare;
      this.spare = null;
      return z;
    }
    const r = Math.sqrt(-2 * Math.log(this.uniform()));
    const angle = 2 * Math.PI * this.uniform();
    this.spare = r * Math.sin(angle);
    return r * Math.cos(angle);
  }
}

/** Derive a reproducible independent stream seed from integer coordinates. */
export function mixSeed(seed, ...coordinates) {
  let x = seed >>> 0;
  for (const c of coordinates) {
    if (!Number.isInteger(c)) throw new TypeError('seed coordinates must be integers');
    x = Math.imul(x ^ (c >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
  }
  return x >>> 0;
}
