import type { Point, Surface, TextOptions } from "./surface.js";

/** The only file in this app that touches CanvasRenderingContext2D — see surface.ts's module doc. */
export class Canvas2DSurface implements Surface {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  width: number;
  height: number;

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

  fillCell(topLeft: Point, sizePx: number, color: string): void {
    const x = Math.round(topLeft.x);
    const y = Math.round(topLeft.y);
    const s = Math.round(sizePx);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, s, s);
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
