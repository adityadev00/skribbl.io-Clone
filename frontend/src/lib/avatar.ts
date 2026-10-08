const COLORS = ['#2f6bff', '#ff4d4d', '#1fae6a', '#ff9f1c', '#8b5cf6', '#e84393', '#00a8c6', '#6c757d'];

/** Stable colour per player id (placeholder until custom avatars in Phase 2). */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function parseRoomCode(input: string): string {
  const last = input.trim().split('/').filter(Boolean).pop() ?? '';
  return last.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
