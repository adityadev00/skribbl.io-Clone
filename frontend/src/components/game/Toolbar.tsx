import { BRUSH_SIZES, PALETTE } from '../../lib/constants';

export type Tool = 'pen' | 'eraser' | 'fill';

interface Props {
  tool: Tool;
  color: string;
  size: number;
  disabled: boolean;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  pen: 'M3 21l3.5-1L18.5 8a2.1 2.1 0 00-3-3L3.5 17 3 21z',
  eraser: 'M7 21h13M5.6 14.4l7-7a2 2 0 013 0l2 2a2 2 0 010 3l-7 7a2 2 0 01-3 0l-2-2a2 2 0 010-3z',
  fill: 'M5 12l7-7 7 7-6 6a2 2 0 01-3 0l-5-5a1 1 0 010-1zM19 15c1 1.5 2 2.7 2 4a2 2 0 01-4 0c0-1.3 1-2.5 2-4z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  clear: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};

const btn = 'grid size-11 place-items-center rounded-xl border-2 transition disabled:cursor-not-allowed disabled:opacity-40';

export function Toolbar({ tool, color, size, disabled, onTool, onColor, onSize, onUndo, onClear }: Props) {
  return (
    <div className="panel flex flex-wrap items-center gap-x-5 gap-y-3 !p-3" role="toolbar" aria-label="Drawing tools">
      <div className="flex gap-1.5" role="group" aria-label="Tool">
        {(['pen', 'eraser', 'fill'] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={tool === t}
            aria-label={t === 'fill' ? 'Fill bucket' : t === 'pen' ? 'Pen' : 'Eraser'}
            title={t === 'fill' ? 'Fill bucket' : t === 'pen' ? 'Pen' : 'Eraser'}
            onClick={() => onTool(t)}
            className={`${btn} ${tool === t ? 'border-ink bg-highlighter' : 'border-ink/25 hover:border-ink'}`}
          >
            <Icon d={ICONS[t]} />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1" role="group" aria-label="Colour">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            onClick={() => onColor(c)}
            style={{ backgroundColor: c }}
            className={`size-7 rounded-md border-2 disabled:opacity-40 ${
              color === c && tool !== 'eraser' ? 'scale-110 border-ink ring-2 ring-marker-blue ring-offset-1' : 'border-ink/30'
            }`}
          />
        ))}
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Brush size">
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled || tool === 'fill'}
            aria-label={`Brush size ${s}`}
            aria-pressed={size === s}
            onClick={() => onSize(s)}
            className={`${btn} ${size === s ? 'border-ink bg-highlighter' : 'border-ink/25 hover:border-ink'}`}
          >
            <span className="rounded-full bg-ink" style={{ width: 4 + s / 2.5, height: 4 + s / 2.5 }} />
          </button>
        ))}
      </div>

      <div className="ml-auto flex gap-1.5">
        <button type="button" disabled={disabled} onClick={onUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className={`${btn} border-ink/25 hover:border-ink`}>
          <Icon d={ICONS.undo} />
        </button>
        <button type="button" disabled={disabled} onClick={onClear} aria-label="Clear canvas" title="Clear canvas" className={`${btn} border-marker-red/50 text-marker-red hover:border-marker-red`}>
          <Icon d={ICONS.clear} />
        </button>
      </div>
    </div>
  );
}
