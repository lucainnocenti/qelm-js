/** Reproducible xorshift32 stream. Not suitable for cryptography. */
export class Random {
  constructor(seed = 1) {
    if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
    this.state = seed >>> 0 || 0x12345678;
    this.spare = null;
  }
  uniform() {
    let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return (this.state + 0.5) / 4294967296;
  }
  normal() {
    if (this.spare !== null) { const z = this.spare; this.spare = null; return z; }
    const r = Math.sqrt(-2 * Math.log(this.uniform())), a = 2 * Math.PI * this.uniform();
    this.spare = r * Math.sin(a); return r * Math.cos(a);
  }
}
/** Derive a reproducible independent stream seed from integer coordinates. */
export function mixSeed(seed, ...coordinates) {
  let x = seed >>> 0;
  for (const c of coordinates) {
    if (!Number.isInteger(c)) throw new TypeError('seed coordinates must be integers');
    x = Math.imul(x ^ (c >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15;
  }
  return x >>> 0;
}
