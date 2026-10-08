import { useEffect, useRef, useState } from 'react';
import { SETTINGS_LIMITS, type SettingsKey, type SettingsPatch } from '../../lib/constants';
import { errorMessage } from '../../lib/socket';
import type { RoomSettings } from '../../types/game';

interface Field { key: SettingsKey; label: string; step: number; format: (v: number) => string }

const FIELDS: Field[] = [
  { key: 'maxPlayers', label: 'Max players', step: 1, format: (v) => String(v) },
  { key: 'rounds', label: 'Rounds', step: 1, format: (v) => String(v) },
  { key: 'drawTime', label: 'Draw time', step: 5, format: (v) => `${v}s` },
  { key: 'wordCount', label: 'Word choices', step: 1, format: (v) => String(v) },
  { key: 'hints', label: 'Hints', step: 1, format: (v) => (v === 0 ? 'Off' : String(v)) },
];

interface Props {
  settings: RoomSettings;
  editable: boolean;
  onChange: (patch: SettingsPatch) => Promise<void>;
}

/**
 * Host edits a local draft instantly; changes are batched (300ms) into one `update_settings`.
 * While a send is pending, server echoes are ignored so a slider never jumps back mid-drag.
 */
export function SettingsPanel({ settings, editable, onChange }: Props) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const queued = useRef<SettingsPatch>({});
  const latest = useRef(settings);

  useEffect(() => {
    latest.current = settings;
    if (timer.current === undefined) setDraft(settings);
  }, [settings]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(patch: SettingsPatch) {
    setDraft((d) => ({ ...d, ...patch }));
    queued.current = { ...queued.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const toSend = queued.current;
      queued.current = {};
      timer.current = undefined;
      try {
        await onChange(toSend);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
        setDraft(latest.current); // roll back to what the server has
      }
    }, 300);
  }

  return (
    <section className="panel" aria-labelledby="settings-heading">
      <h2 id="settings-heading" className="mb-1 text-2xl font-extrabold">Game settings</h2>
      {!editable && <p className="mb-3 text-ink-soft">Only the host can change these.</p>}

      <div className="mt-3 flex flex-col gap-4">
        {FIELDS.map((f) => {
          const { min, max } = SETTINGS_LIMITS[f.key];
          const id = `setting-${f.key}`;
          return (
            <div key={f.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={id} className="font-semibold">{f.label}</label>
                <output htmlFor={id} className="font-marker text-xl text-marker-blue">{f.format(draft[f.key])}</output>
              </div>
              <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={f.step}
                value={draft[f.key]}
                disabled={!editable}
                onChange={(e) => change({ [f.key]: Number(e.target.value) })}
                className="w-full accent-marker-blue disabled:opacity-60"
              />
            </div>
          );
        })}

        <div>
          <span className="mb-1.5 block font-semibold">Visibility</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Room visibility">
            {[{ v: true, l: 'Private' }, { v: false, l: 'Public' }].map((o) => (
              <button
                key={o.l}
                type="button"
                disabled={!editable}
                aria-pressed={draft.isPrivate === o.v}
                onClick={() => change({ isPrivate: o.v })}
                className={`rounded-xl border-2 py-2 font-bold disabled:cursor-not-allowed ${
                  draft.isPrivate === o.v ? 'border-ink bg-highlighter/60' : 'border-ink/25 text-ink-soft'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 font-semibold text-marker-red">{error}</p>}
    </section>
  );
}
