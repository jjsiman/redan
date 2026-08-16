/**
 * The renderer surface interface (doc §8.2): the parcel renderer is written
 * against a tiny abstraction, not directly against `CanvasRenderingContext2D`
 * — `canvas2d.ts` is the *only* file in this app that touches the DOM canvas
 * API. That's the difference between a one-file port to `react-native-skia`
 * later and a rewrite.
 *
 * Simplification from the doc's own framing: doc §6.4 describes a per-8-yard
 * -cell grid with deterministic dithering for turf texture. This first pass
 * draws real shapes (polygons/polylines/circles) instead of a literal cell
 * grid — closer to `packages/content/src/render.ts`'s SVG diagnostic than
 * the doc's dithered-grid renderer. The grid/dither texture is deferred, not
 * abandoned; this surface is deliberately small enough that adding a
 * `fillCell` method later doesn't touch any calling code.
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
   * Fills one screen-space rect of exactly `sizePx` px at top-left corner
   * `topLeft` — the doc §6.4/§8.2 pixel-grid primitive, land mode's cell
   * renderer (`render/grid.ts`). Integer-snapped by the implementation so
   * cells tile with no seams or antialiasing fringe.
   */
  fillCell(topLeft: Point, sizePx: number, color: string): void;
}
