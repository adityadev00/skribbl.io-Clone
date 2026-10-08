import type { Point, Stroke } from '../types/game';

/**
 * Every client draws on the SAME fixed 800×600 bitmap and CSS scales it to fit. Points travel as
 * normalized 0..1 coordinates, so a stroke lands in exactly the same place on every screen,
 * and brush sizes (in bitmap pixels) look proportionally identical everywhere.
 */
export const CANVAS_W = 800;
export const CANVAS_H = 600;

const px = (p: Point) => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H });
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function setStyle(ctx: CanvasRenderingContext2D, op: Stroke) {
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function clearCanvas(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

export function drawDot(ctx: CanvasRenderingContext2D, op: Stroke) {
  const p = px(op.points[0]);
  setStyle(ctx, op);
  ctx.beginPath();
  ctx.arc(p.x, p.y, op.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Smoothing: instead of joining raw points with straight lines, curve through the MIDPOINTS of
 * consecutive points using each real point as the control point (quadratic Bézier).
 * `drawRange(from)` paints the pieces for points `from…end` as points stream in; `renderOp` paints the same
 * geometry in one path for redraws — so live and replayed strokes look identical.
 */
export function drawRange(ctx: CanvasRenderingContext2D, op: Stroke, from: number) {
  const n = op.points.length;
  if (n < 2) return drawDot(ctx, op);
  let i = Math.max(1, from);
  if (i >= n) return;
  setStyle(ctx, op);
  ctx.beginPath(); // consecutive pieces share endpoints, so a whole batch is ONE path / ONE stroke() call
  if (i === 1) {
    const p0 = px(op.points[0]);
    const m = mid(p0, px(op.points[1]));
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(m.x, m.y);
    i = 2;
  } else {
    const s = mid(px(op.points[i - 2]), px(op.points[i - 1]));
    ctx.moveTo(s.x, s.y);
  }
  for (; i < n; i++) {
    const c = px(op.points[i - 1]);
    const e = mid(c, px(op.points[i]));
    ctx.quadraticCurveTo(c.x, c.y, e.x, e.y);
  }
  ctx.stroke();
}

/** Paint only the newest point's piece (kept for single-point callers). */
export function drawLatest(ctx: CanvasRenderingContext2D, op: Stroke) {
  drawRange(ctx, op, op.points.length - 1);
}

/** Last half-segment, so a finished stroke reaches its final point. */
export function drawTail(ctx: CanvasRenderingContext2D, op: Stroke) {
  const n = op.points.length;
  if (n < 2) return;
  const a = px(op.points[n - 2]);
  const b = px(op.points[n - 1]);
  const m = mid(a, b);
  setStyle(ctx, op);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function renderOp(ctx: CanvasRenderingContext2D, op: Stroke) {
  if (op.kind === 'fill') return floodFill(ctx, op.points[0], op.color);
  const n = op.points.length;
  if (n === 0) return;
  if (n === 1) return drawDot(ctx, op);
  setStyle(ctx, op);
  ctx.beginPath();
  const p0 = px(op.points[0]);
  ctx.moveTo(p0.x, p0.y);
  const first = mid(p0, px(op.points[1]));
  ctx.lineTo(first.x, first.y);
  for (let i = 2; i < n; i++) {
    const c = px(op.points[i - 1]);
    const e = mid(c, px(op.points[i]));
    ctx.quadraticCurveTo(c.x, c.y, e.x, e.y);
  }
  const last = px(op.points[n - 1]);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export function redraw(ctx: CanvasRenderingContext2D, ops: Stroke[]) {
  clearCanvas(ctx);
  ops.forEach((op) => renderOp(ctx, op));
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Paint bucket: scanline flood fill on the pixel buffer. A small tolerance swallows the
 * anti-aliased fringe around strokes. Deterministic for identical canvases, so each client can
 * run it locally instead of shipping pixel data over the socket.
 */
export function floodFill(ctx: CanvasRenderingContext2D, at: Point, hex: string, tolerance = 40) {
  const w = CANVAS_W;
  const h = CANVAS_H;
  const x0 = Math.min(w - 1, Math.max(0, Math.floor(at.x * w)));
  const y0 = Math.min(h - 1, Math.max(0, Math.floor(at.y * h)));
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const s = (y0 * w + x0) * 4;
  const [tr, tg, tb] = [d[s], d[s + 1], d[s + 2]];
  const [fr, fg, fb] = hexToRgb(hex);
  if (tr === fr && tg === fg && tb === fb) return;

  const match = (i: number) =>
    Math.abs(d[i] - tr) <= tolerance && Math.abs(d[i + 1] - tg) <= tolerance && Math.abs(d[i + 2] - tb) <= tolerance;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [x0, y0];

  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let p = y * w + x;
    if (seen[p] || !match(p * 4)) continue;
    while (x > 0 && !seen[p - 1] && match((p - 1) * 4)) { x--; p--; }
    let up = false;
    let down = false;
    while (x < w && !seen[p] && match(p * 4)) {
      seen[p] = 1;
      const i = p * 4;
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
      if (y > 0) {
        const ok = !seen[p - w] && match((p - w) * 4);
        if (ok && !up) { stack.push(x, y - 1); up = true; } else if (!ok) up = false;
      }
      if (y < h - 1) {
        const ok = !seen[p + w] && match((p + w) * 4);
        if (ok && !down) { stack.push(x, y + 1); down = true; } else if (!ok) down = false;
      }
      x++; p++;
    }
  }
  ctx.putImageData(img, 0, 0);
}
