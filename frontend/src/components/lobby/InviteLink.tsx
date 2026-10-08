import { Button } from '../ui/Button';
import { useCopy } from '../../hooks/useCopy';

export function InviteLink({ url }: { url: string }) {
  const [copied, copy] = useCopy();
  return (
    <div>
      <label htmlFor="invite-url" className="mb-1.5 block font-semibold">Invite link</label>
      <div className="flex gap-2">
        <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 text-base" />
        <Button variant="secondary" onClick={() => copy(url)} className="shrink-0 !px-4">
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
