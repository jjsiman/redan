import type { Point, Surface, TextOptions } from "./surface.js";

/** The only file in this app that touches CanvasRenderingContext2D — see surface.ts's module doc. */
export class Canvas2DSurface implements Surface {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width: number;
  height: number;

  // drawPixelBuffer's scratch: an offscreen canvas sized to the art buffer
  // (not the screen), reused across calls — see its doc below.
  private bufCanvas: HTMLCanvasElement | null = null;
  private bufCtx: CanvasRenderingContext2D | null = null;
  private bufImageData: ImageData | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2DSurface: 2d context unavailable");
    this.ctx = ctx;
    this.width = 0;
    this.height = 0;
    this.resize(width, height, dpr);
  }

  resize(width: number, height: number, dpr: number): void {
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    // Reset before scaling — a fresh backing store starts at the identity
    // transform, but resize() can be called on an already-scaled context.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Draws the art buffer at its native resolution onto a scratch canvas
   * (via `putImageData`, so no per-texel draw calls), then `drawImage`s that
   * scratch into the destination rect scaled up by `scale` with
   * `imageSmoothingEnabled = false` — nearest-neighbor, so tiles stay crisp
   * blocks rather than blurring into each other. The scratch canvas/
   * `ImageData` are reallocated only when `width`/`height` change, matching
   * this class's existing resize()-early-returns-when-unchanged discipline.
   */
  drawPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number, dest: Point, scale: number): void {
    if (!this.bufCanvas || this.bufCanvas.width !== width || this.bufCanvas.height !== height) {
      this.bufCanvas = document.createElement("canvas");
      this.bufCanvas.width = width;
      this.bufCanvas.height = height;
      const bufCtx = this.bufCanvas.getContext("2d");
      if (!bufCtx) throw new Error("Canvas2DSurface: 2d context unavailable for pixel buffer scratch");
      this.bufCtx = bufCtx;
      this.bufImageData = bufCtx.createImageData(width, height);
    }
    this.bufImageData!.data.set(pixels);
    this.bufCtx!.putImageData(this.bufImageData!, 0, 0);

    const x = Math.round(dest.x);
    const y = Math.round(dest.y);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.bufCanvas, 0, 0, width, height, x, y, Math.round(width * scale), Math.round(height * scale));
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  fillPolygon(points: Point[], color: string): void {
    if (points.length === 0) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) this.ctx.lineTo(p.x, p.y);
    this.ctx.closePath();
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  strokePolyline(points: Point[], color: string, width: number, dash: number[] = []): void {
    if (points.length < 2) return;
    this.ctx.save();
    this.ctx.setLineDash(dash);
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) this.ctx.lineTo(p.x, p.y);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
    this.ctx.stroke();
    this.ctx.restore();
  }

  fillCircle(center: Point, radius: number, color: string): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  strokeCircle(center: Point, radius: number, color: string, width: number, dash: number[] = []): void {
    this.ctx.save();
    this.ctx.setLineDash(dash);
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawText(text: string, at: Point, opts: TextOptions = {}): void {
    const size = opts.size ?? 12;
    const weight = opts.weight ?? "normal";
    this.ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    this.ctx.fillStyle = opts.color ?? "#000";
    this.ctx.textAlign = opts.align ?? "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, at.x, at.y);
  }
}
