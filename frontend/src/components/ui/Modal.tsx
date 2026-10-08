import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

/** Small accessible dialog: Esc / backdrop / button close it, focus moves in, then returns to the opener. */
export function Modal({ title, children, onClose, closeLabel = 'Close' }: Props) {
  const titleId = useId();
  const [opener] = useState(() => document.activeElement as HTMLElement | null); // captured before autoFocus moves focus

  const closeRef = useRef(onClose);
  closeRef.current = onClose; // always call the latest handler without re-subscribing

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => { opener?.focus?.(); }, [opener]); // give focus back only when the dialog goes away

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => { if (e.key === 'Tab') e.preventDefault(); }} // the close button is the only focusable control
        className="panel animate-pop w-full max-w-sm text-center"
      >
        <h2 id={titleId} className="mb-2 text-2xl font-extrabold">{title}</h2>
        <div className="mb-5 text-lg text-ink-soft">{children}</div>
        <Button autoFocus onClick={onClose} className="w-full">{closeLabel}</Button>
      </div>
    </div>
  );
}
