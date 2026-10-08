export const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * correct   → exact match after trim / lowercase / whitespace collapse
 * close     → one edit away (only for words ≥ 5 chars) — shown privately as "close!"
 * incorrect → anything else
 */
export function matchGuess(guess: string, answer: string): 'correct' | 'close' | 'incorrect' {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g) return 'incorrect';
  if (g === a) return 'correct';
  if (a.length >= 5 && levenshtein(g, a) === 1) return 'close';
  return 'incorrect';
}
