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
  clear(color: string): void;
  fillPolygon(points: Point[], color: string): void;
  strokePolyline(points: Point[], color: string, width: number, dash?: number[]): void;
  fillCircle(center: Point, radius: number, color: string): void;
  strokeCircle(center: Point, radius: number, color: string, width: number, dash?: number[]): void;
  drawText(text: string, at: Point, opts?: TextOptions): void;
}
