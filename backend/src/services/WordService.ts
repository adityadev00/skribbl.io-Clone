import wordsData from '../data/words.json';

export type WordCategory = keyof typeof wordsData;

export class WordService {
  private readonly pool: string[];

  constructor(categories: WordCategory[] = Object.keys(wordsData) as WordCategory[]) {
    this.pool = [...new Set(categories.flatMap((c) => wordsData[c]))];
  }

  /** Pick `count` random words, avoiding `exclude` (falls back to the full pool if exhausted). */
  pickWords(count: number, exclude: ReadonlySet<string> = new Set()): string[] {
    let available = this.pool.filter((w) => !exclude.has(w.toLowerCase()));
    if (available.length < count) available = [...this.pool];
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    return available.slice(0, count);
  }
}
