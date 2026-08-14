/**
 * Portability contract: no host RNG (Math.random, crypto.getRandomValues).
 * Every draw traces back to a seed, so a `simVersion` + `seed` + `parcel`
 * + `pieces` fully determines a result, byte for byte, on any engine.
 */
export type Rng = () => number;

/** mulberry32 — small, fast, decent statistical quality, pure integer/float math. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller, driven entirely by the injected rng. */
export function randNormal(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Normal sample with given mean/sd, clamped to zero sd for degenerate inputs. */
export function randNormalMV(rng: Rng, mean: number, sd: number): number {
  if (sd <= 0) return mean;
  return mean + randNormal(rng) * sd;
}
