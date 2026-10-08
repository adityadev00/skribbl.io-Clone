import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Toolbar, type Tool } from './Toolbar';
import { CANVAS_H, CANVAS_W, clearCanvas, drawDot, drawRange, drawTail, floodFill, redraw } from '../../lib/canvasEngine';
import { EVENTS } from '../../lib/events';
import { emitFast, socket } from '../../lib/socket';
import type { DrawData, GamePhase, Point, Stroke } from '../../types/game';

interface Props {
  /** true only for the drawer while the word is being drawn */
  canDraw: boolean;
  showToolbar: boolean;
  phase: GamePhase;
  /** snapshot of existing ops, applied whenever `syncKey` changes (join / rejoin / drawing start) */
  strokes: Stroke[];
  syncKey: number;
  /** overlays (word picker, round end…) rendered on top of the board */
  children?: ReactNode;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000; // 0.0001 × 800px = 0.08px — invisible, but ~40% smaller packets
const MIN_STEP = 0.0015;        // ignore sub-pixel jitter (normalized units)
const SEND_INTERVAL_MS = 16;    // network flush rate ≈ 60/s
const MAX_BATCH = 64;           // keep in sync with backend MAX_POINTS_PER_BATCH
const MAX_POINTS = 6000;        // keep in sync with backend MAX_POINTS_PER_STROKE

/**
 * Performance model — three separate rates:
 *  1. INPUT   (pointermove, up to ~1000/s on gaming mice): handled with NO React state. Points are
 *             pushed into refs and painted straight onto the canvas — one stroke() per event, however many
 *             coalesced samples it carries — so local ink appears instantly.
 *  2. NETWORK (≈60/s): points are buffered and flushed as ONE `draw_move {points}` per animation frame
 *             (rAF, ≥16 ms apart), instead of one packet per sample.
 *  3. REACT   (≈0/s while drawing): re-renders happen only on tool/colour/size clicks and game events.
 * `ops` is the single ordered source of truth used for undo/redraw.
 */
export function Canvas({ canDraw, showToolbar, phase, strokes, syncKey, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rectRef = useRef<DOMRect | null>(null);   // cached bounding box (avoids forced layout per pointer sample)
  const ops = useRef<Stroke[]>([]);
  const active = useRef<Stroke | null>(null);
  const pending = useRef<Point[]>([]);             // points painted locally but not yet sent
  const frame = useRef(0);
  const lastSent = useRef(0);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(8);

  useEffect(() => {
    // No `willReadFrequently`: that flag forces a CPU-backed canvas and slows every stroke. We only read
    // pixels on a bucket fill, where one GPU readback is cheaper than paying on every drawn segment.
    ctxRef.current = canvasRef.current?.getContext('2d') ?? null;
    if (ctxRef.current) clearCanvas(ctxRef.current);
  }, []);

  // ── Network batching ──
  const sendPending = useCallback(() => {
    const buf = pending.current;
    if (!buf.length) return;
    pending.current = [];
    for (let i = 0; i < buf.length; i += MAX_BATCH) emitFast(EVENTS.DRAW_MOVE, { points: buf.slice(i, i + MAX_BATCH) });
    lastSent.current = performance.now();
  }, []);

  const cancelFrame = useCallback(() => {
    if (frame.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const scheduleSend = useCallback(() => {
    if (typeof requestAnimationFrame !== 'function') return sendPending(); // non-browser fallback
    if (frame.current) return;
    const tick = (now: number) => {
      frame.current = 0;
      if (now - lastSent.current < SEND_INTERVAL_MS - 1) frame.current = requestAnimationFrame(tick); // fast display: wait
      else sendPending();
    };
    frame.current = requestAnimationFrame(tick);
  }, [sendPending]);

  /** Send whatever is buffered right now (before stroke end / undo / clear, to keep ordering correct). */
  const flushNow = useCallback(() => {
    cancelFrame();
    sendPending();
  }, [cancelFrame, sendPending]);

  useEffect(() => cancelFrame, [cancelFrame]);

  // ── Cached geometry ──
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const invalidate = () => { rectRef.current = null; };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    ro?.observe(el);
    window.addEventListener('scroll', invalidate, { passive: true });
    window.addEventListener('resize', invalidate);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', invalidate);
      window.removeEventListener('resize', invalidate);
    };
  }, []);

  const measure = () => (rectRef.current = canvasRef.current?.getBoundingClientRect() ?? null);

  const toPoint = (e: { clientX: number; clientY: number }): Point | null => {
    const r = rectRef.current ?? measure();
    if (!r || !r.width || !r.height) return null;
    return { x: round4(clamp01((e.clientX - r.left) / r.width)), y: round4(clamp01((e.clientY - r.top) / r.height)) };
  };

  // Snapshot sync: drawing starts (empty), or we joined / reconnected mid-drawing (existing ops).
  useEffect(() => {
    const ctx = ctxRef.current;
    if (phase !== 'drawing' || !ctx) return;
    ops.current = strokesRef.current.map((s) => ({ ...s, points: [...s.points] }));
    active.current = null;
    redraw(ctx, ops.current);
  }, [phase, syncKey]);

  useEffect(() => {
    if (!canDraw) {
      active.current = null;
      pending.current = [];
      cancelFrame();
    }
  }, [canDraw, cancelFrame]);

  // Remote drawing stream (everyone except the drawer receives these).
  useEffect(() => {
    const onData = (d: DrawData) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (d.type === 'start') {
        const op: Stroke = { kind: 'stroke', color: d.color, size: d.size, points: [{ x: d.x, y: d.y }] };
        ops.current.push(op);
        active.current = op;
        drawDot(ctx, op);
      } else if (d.type === 'move' && active.current) {
        const op = active.current;
        const from = op.points.length;
        if ('points' in d) op.points.push(...d.points);
        else op.points.push({ x: d.x, y: d.y });
        drawRange(ctx, op, from); // whole batch → one stroke() call
      } else if (d.type === 'end' && active.current) {
        drawTail(ctx, active.current);
        active.current = null;
      } else if (d.type === 'fill') {
        const p = { x: d.x, y: d.y };
        ops.current.push({ kind: 'fill', color: d.color, size: 0, points: [p] });
        floodFill(ctx, p, d.color);
      }
    };
    const onUndo = () => {
      const ctx = ctxRef.current;
      ops.current.pop();
      active.current = null;
      if (ctx) redraw(ctx, ops.current);
    };
    const onClear = () => {
      const ctx = ctxRef.current;
      ops.current = [];
      active.current = null;
      if (ctx) clearCanvas(ctx);
    };
    socket.on(EVENTS.DRAW_DATA, onData);
    socket.on(EVENTS.DRAW_UNDO, onUndo);
    socket.on(EVENTS.CANVAS_CLEAR, onClear);
    return () => {
      socket.off(EVENTS.DRAW_DATA, onData);
      socket.off(EVENTS.DRAW_UNDO, onUndo);
      socket.off(EVENTS.CANVAS_CLEAR, onClear);
    };
  }, []);

  // ── Local drawing ──
  const undo = useCallback(() => {
    if (!canDraw) return;
    flushNow();
    ops.current.pop();
    active.current = null;
    if (ctxRef.current) redraw(ctxRef.current, ops.current);
    emitFast(EVENTS.DRAW_UNDO);
  }, [canDraw, flushNow]);

  const clear = useCallback(() => {
    if (!canDraw) return;
    flushNow();
    ops.current = [];
    active.current = null;
    if (ctxRef.current) clearCanvas(ctxRef.current);
    emitFast(EVENTS.CANVAS_CLEAR);
  }, [canDraw, flushNow]);

  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDraw, undo]);

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    if (!canDraw || !ctx || (e.pointerType === 'mouse' && e.button !== 0)) return;
    measure(); // fresh box once per stroke; reused for every sample until the stroke ends
    const p = toPoint(e);
    if (!p) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture?.(e.pointerId); // keep receiving moves outside the canvas

    if (tool === 'fill') {
      ops.current.push({ kind: 'fill', color, size: 0, points: [p] });
      floodFill(ctx, p, color);
      emitFast(EVENTS.DRAW_FILL, { x: p.x, y: p.y, color });
      return;
    }
    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const strokeSize = tool === 'eraser' ? Math.round(size * 1.5) : size;
    const op: Stroke = { kind: 'stroke', color: strokeColor, size: strokeSize, points: [p] };
    ops.current.push(op);
    active.current = op;
    pending.current = [];
    drawDot(ctx, op);
    emitFast(EVENTS.DRAW_START, { x: p.x, y: p.y, color: strokeColor, size: strokeSize });
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    const op = active.current;
    if (!canDraw || !ctx || !op) return;
    // Coalesced events = every sample the device produced since the last frame (smoother fast strokes).
    const native = e.nativeEvent;
    const samples = native.getCoalescedEvents?.() ?? [];
    const from = op.points.length;
    let last = op.points[from - 1];
    for (const s of samples.length ? samples : [native]) {
      if (op.points.length >= MAX_POINTS) break;
      const p = toPoint(s);
      if (!p || Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) continue;
      op.points.push(p);
      pending.current.push(p);
      last = p;
    }
    if (op.points.length > from) {
      drawRange(ctx, op, from); // paint immediately: local latency stays ~0
      scheduleSend();           // …but network traffic is capped at ~60 messages/s
    }
  };

  const finish = () => {
    const ctx = ctxRef.current;
    const op = active.current;
    if (!op) return;
    active.current = null;
    flushNow(); // remaining points must reach the server BEFORE draw_end
    if (ctx) drawTail(ctx, op);
    emitFast(EVENTS.DRAW_END);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border-2 border-ink bg-white" style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          role="img"
          aria-label="Drawing board"
          className={`block h-full w-full touch-none ${canDraw ? 'cursor-crosshair' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        />
        {children}
      </div>
      {showToolbar && (
        <Toolbar
          tool={tool} color={color} size={size} disabled={!canDraw}
          onTool={setTool} onColor={(c) => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
          onSize={setSize} onUndo={undo} onClear={clear}
        />
      )}
    </div>
  );
}
