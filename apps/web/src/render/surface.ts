/**
 * The renderer surface interface (doc §8.2): the parcel renderer is written
 * against a tiny abstraction, not directly against `CanvasRenderingContext2D`
 * — `canvas2d.ts` is the *only* file in this app that touches the DOM canvas
 * API. That's the difference between a one-file port to `react-native-skia`
 * later and a rewrite.
 *
 * Tray mode draws real shapes (polygons/polylines/circles) — closer to
 * `packages/content/src/render.ts`'s SVG diagnostic than doc §6.4's
 * dithered-grid renderer. Land mode (`render/grid.ts`) implements that
 * dithered-grid idea for real via `drawPixelBuffer`: it rasterizes the whole
 * scene into one art-resolution RGBA buffer client-side and hands it to the
 * surface as one blit, rather than issuing a fill call per tile. That's also
 * the skia-portable shape — `Skia.Image.MakeImage` from bytes plus
 * `drawImageRect` with nearest-neighbor sampling — where a per-tile
 * `fillRect` equivalent never was.
 */
export interface Point {
  x: number;
  y: number;
}

export interface TextOptions {
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  weight?: "normal" | "bold";
}

export interface Surface {
  width: number;
  height: number;
  /**
   * Resizes the backing store in place, early-returning when `width`/
   * `height`/`dpr` haven't changed. Land mode reuses one `Surface` across a
   * green drag instead of constructing a fresh one per render — a fresh
   * `Canvas2DSurface` reallocates the canvas backing store and resets all
   * context state on every call, which is one of the concrete reasons a
   * naive per-render surface can't hold 60fps on pointermove.
   */
  resize(width: number, height: number, dpr: number): void;
  clear(color: string): void;
  fillPolygon(points: Point[], color: string): void;
  strokePolyline(points: Point[], color: string, width: number, dash?: number[]): void;
  fillCircle(center: Point, radius: number, color: string): void;
  strokeCircle(center: Point, radius: number, color: string, width: number, dash?: number[]): void;
  drawText(text: string, at: Point, opts?: TextOptions): void;
  /**
   * Blits an art-resolution RGBA pixel buffer (`width` x `height` texels,
   * row-major, 4 bytes/texel) at screen-space top-left `dest`, each texel
   * drawn as a `scale` x `scale` screen-px block with nearest-neighbor
   * sampling (no antialiasing/blur between texels) — the doc §6.4/§8.2
   * pixel-grid primitive, land mode's rasterizer (`render/grid.ts`).
   * Integer-snapped by the implementation so tiles have no seams.
   */
  drawPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number, dest: Point, scale: number): void;
}
