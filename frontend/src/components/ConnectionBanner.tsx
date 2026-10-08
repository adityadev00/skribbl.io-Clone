import { useGame } from '../hooks/useGame';
import { SERVER_URL_MISSING } from '../lib/socket';

export function ConnectionBanner() {
  const { state } = useGame();
  if (SERVER_URL_MISSING) {
    return (
      <div role="alert" className="sticky top-0 z-50 border-b-2 border-ink bg-marker-red px-4 py-2 text-center font-semibold text-white">
        The backend URL isn't configured. Set VITE_SERVER_URL in your hosting settings and redeploy.
      </div>
    );
  }
  if (state.status === 'connected') return null;
  const first = state.status === 'connecting';
  return (
    <div role="status" className="sticky top-0 z-50 border-b-2 border-ink bg-highlighter px-4 py-2 text-center font-semibold">
      {first
        ? 'Connecting to the server… free hosting can take up to a minute to wake up.'
        : 'Connection lost — reconnecting. Your seat is held for 30 seconds.'}
    </div>
  );
}
