import type { Room } from './Room';
import type { Player } from './Player';
import type { WordService } from '../services/WordService';
import { EVENTS } from '../config/events';
import {
  BRUSH_SIZE, MAX_OPS_PER_TURN, MAX_POINTS_PER_BATCH, MAX_POINTS_PER_STROKE, MIN_PLAYERS_TO_START, SCORING, TIMING,
} from '../config/constants';
import type {
  GamePhase, GameStatePayload, GuessResult, LeaderboardEntry,
  Point, RoomSettings, Stroke, TurnEndReason,
} from '../types';
import { matchGuess } from '../utils/wordMatcher';
import { GameError } from '../utils/errors';

const LETTER = /[\p{L}\p{N}]/u;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface StrokeStartInput { x: number; y: number; color: string; size: number }

/**
 * Owns everything that happens between "host clicked start" and "game over":
 * turn order, word selection, timers, hints, drawing state, guess checking and scoring.
 * Emits through Room (→ Broadcaster); never touches sockets directly.
 */
export class Game {
  private _phase: GamePhase = 'lobby';
  private readonly settings: RoomSettings;

  private currentRound = 0;
  private turnQueue: string[] = [];
  private drawerId: string | null = null;
  private word: string | null = null;
  private wordOptions: string[] = [];
  private readonly usedWords = new Set<string>();
  private readonly revealed = new Set<number>();

  private strokes: Stroke[] = [];
  private activeStroke: Stroke | null = null;
  private turnEndsAt = 0;

  private chooseTimer?: NodeJS.Timeout;
  private turnTimer?: NodeJS.Timeout;
  private nextTurnTimer?: NodeJS.Timeout;
  private hintTimers: NodeJS.Timeout[] = [];

  constructor(private readonly room: Room, private readonly words: WordService) {
    this.settings = { ...room.settings }; // snapshot: settings are frozen once the game starts
  }

  get phase(): GamePhase { return this._phase; }
  get currentDrawerId(): string | null { return this.drawerId; }

  // ───────────────────────── Lifecycle ─────────────────────────

  start(): void {
    this.room.getPlayers().forEach((p) => p.resetForNewGame());
    this.currentRound = 0;
    this.startRound();
  }

  destroy(): void {
    this.clearTimers();
  }

  private startRound(): void {
    this.currentRound += 1;
    this.turnQueue = this.room.getConnectedPlayers().map((p) => p.id);
    this.nextTurn();
  }

  private nextTurn(): void {
    if (this.room.connectedCount < MIN_PLAYERS_TO_START) return this.endGame();

    let drawer: Player | undefined;
    while (this.turnQueue.length && !drawer) {
      const candidate = this.room.getPlayer(this.turnQueue.shift()!);
      if (candidate?.isConnected) drawer = candidate; // skip players who left / are disconnected
    }

    if (!drawer) {
      // Everyone in this round has drawn
      return this.currentRound >= this.settings.rounds ? this.endGame() : this.startRound();
    }
    this.beginChoosing(drawer);
  }

  private beginChoosing(drawer: Player): void {
    this.clearTimers();
    this._phase = 'choosing';
    this.drawerId = drawer.id;
    this.word = null;
    this.revealed.clear();
    this.strokes = [];
    this.activeStroke = null;
    this.room.getPlayers().forEach((p) => p.resetTurnState());
    this.wordOptions = this.words.pickWords(this.settings.wordCount, this.usedWords);

    const base = {
      round: this.currentRound,
      totalRounds: this.settings.rounds,
      drawerId: drawer.id,
      drawTime: this.settings.drawTime,
      players: this.room.getPublicPlayers(drawer.id),
    };
    this.room.broadcast(EVENTS.CANVAS_CLEAR);
    this.room.sendTo(drawer.id, EVENTS.ROUND_START, { ...base, wordOptions: this.wordOptions });
    this.room.broadcastExcept(drawer.id, EVENTS.ROUND_START, { ...base, wordOptions: [] });

    this.chooseTimer = setTimeout(() => {
      if (this._phase === 'choosing') {
        const pick = this.wordOptions[Math.floor(Math.random() * this.wordOptions.length)];
        this.beginDrawing(pick);
      }
    }, TIMING.wordChoiceMs);
  }

  /** Drawer picks one of the offered words (case-insensitive). */
  chooseWord(playerId: string, word: string): void {
    if (this._phase !== 'choosing' || playerId !== this.drawerId) {
      throw new GameError('INVALID_ACTION', 'You cannot choose a word right now');
    }
    const chosen = this.wordOptions.find((w) => w.toLowerCase() === String(word).trim().toLowerCase());
    if (!chosen) throw new GameError('INVALID_WORD', 'Pick one of the offered words');
    this.beginDrawing(chosen);
  }

  private beginDrawing(word: string): void {
    clearTimeout(this.chooseTimer);
    this.word = word;
    this.usedWords.add(word.toLowerCase());
    this._phase = 'drawing';
    this.turnEndsAt = Date.now() + this.settings.drawTime * 1000;
    this.turnTimer = setTimeout(() => this.endTurn('time_up'), this.settings.drawTime * 1000);
    this.scheduleHints();
    this.broadcastState();
  }

  private endTurn(reason: TurnEndReason): void {
    if (this._phase !== 'drawing' && this._phase !== 'choosing') return;
    this.clearTimers();
    this._phase = 'round_end';
    this.room.broadcast(EVENTS.ROUND_END, {
      word: this.word,
      reason,
      scores: this.getLeaderboard(),
      players: this.room.getPublicPlayers(this.drawerId),
      nextDrawerId: this.turnQueue[0] ?? null,
    });
    this.nextTurnTimer = setTimeout(() => this.nextTurn(), TIMING.roundEndMs);
  }

  private endGame(): void {
    if (this._phase === 'game_over') return;
    this.clearTimers();
    this._phase = 'game_over';
    const leaderboard = this.getLeaderboard();
    this.room.broadcast(EVENTS.GAME_OVER, { winner: leaderboard[0] ?? null, leaderboard });
  }

  // ───────────────────────── Guessing & scoring ─────────────────────────

  /**
   * Checks a guess. On a correct guess: awards points, broadcasts guess_result (never the word),
   * and ends the turn early if everyone has guessed. For 'close' / 'incorrect' the caller decides
   * how to show it in chat.
   */
  handleGuess(player: Player, text: string): GuessResult {
    if (this._phase !== 'drawing' || !this.word || player.id === this.drawerId || player.hasGuessed) {
      return { outcome: 'not_allowed' };
    }
    const outcome = matchGuess(text, this.word);
    if (outcome !== 'correct') return { outcome };

    const points = this.guesserPoints();
    player.addScore(points);
    player.hasGuessed = true;
    this.awardDrawer();

    this.room.broadcast(EVENTS.GUESS_RESULT, {
      correct: true, playerId: player.id, playerName: player.name, points,
    });
    this.room.broadcast(EVENTS.PLAYERS_UPDATE, { players: this.room.getPublicPlayers(this.drawerId) });
    this.checkAllGuessed();
    return { outcome, points };
  }

  private guesserPoints(): number {
    const total = this.settings.drawTime * 1000;
    const left = clamp(this.turnEndsAt - Date.now(), 0, total);
    return SCORING.guessBase + Math.round(SCORING.guessTimeBonus * (left / total));
  }

  private awardDrawer(): void {
    const drawer = this.drawerId ? this.room.getPlayer(this.drawerId) : undefined;
    const guessers = this.room.connectedCount - 1;
    if (drawer && guessers > 0) drawer.addScore(Math.round(SCORING.drawerMax / guessers));
  }

  private checkAllGuessed(): void {
    const guessers = this.room.getConnectedPlayers().filter((p) => p.id !== this.drawerId);
    if (guessers.length > 0 && guessers.every((p) => p.hasGuessed)) this.endTurn('all_guessed');
  }

  getLeaderboard(): LeaderboardEntry[] {
    return this.room
      .getPlayers()
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ playerId: p.id, name: p.name, score: p.score, rank: i + 1 }));
  }

  // ───────────────────────── Hints ─────────────────────────

  private scheduleHints(): void {
    const letters = [...(this.word ?? '')].filter((c) => LETTER.test(c)).length;
    const count = Math.min(this.settings.hints, Math.max(0, letters - 1)); // never reveal the whole word
    const total = this.settings.drawTime * 1000;
    for (let i = 1; i <= count; i++) {
      this.hintTimers.push(setTimeout(() => this.revealHint(), (total * i) / (count + 1)));
    }
  }

  private revealHint(): void {
    if (this._phase !== 'drawing' || !this.word) return;
    const candidates = [...this.word]
      .map((c, i) => (LETTER.test(c) && !this.revealed.has(i) ? i : -1))
      .filter((i) => i >= 0);
    if (!candidates.length) return;
    this.revealed.add(candidates[Math.floor(Math.random() * candidates.length)]);
    this.room.broadcast(EVENTS.HINT_UPDATE, { hint: this.getHint() });
  }

  /** Blank mask, e.g. "ice cream" → ['_','_','_',' ','_','_','_','_','_']. */
  getHint(): string[] {
    if (!this.word) return [];
    const showAll = this._phase === 'round_end' || this._phase === 'game_over';
    return [...this.word].map((c, i) => (!LETTER.test(c) || showAll || this.revealed.has(i) ? c : '_'));
  }

  // ───────────────────────── Drawing (drawer only) ─────────────────────────

  private canDraw(playerId: string): boolean {
    return this._phase === 'drawing' && playerId === this.drawerId;
  }

  private sanitizePoint(x: unknown, y: unknown): Point | null {
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  startStroke(playerId: string, input: StrokeStartInput): void {
    if (!this.canDraw(playerId) || this.strokes.length >= MAX_OPS_PER_TURN) return;
    const point = this.sanitizePoint(input.x, input.y);
    if (!point) return;
    const color = HEX_COLOR.test(input.color) ? input.color : '#000000';
    const size = clamp(Number(input.size) || BRUSH_SIZE.min, BRUSH_SIZE.min, BRUSH_SIZE.max);

    const stroke: Stroke = { kind: 'stroke', color, size, points: [point] };
    this.strokes.push(stroke);
    this.activeStroke = stroke;
    this.room.broadcastExcept(playerId, EVENTS.DRAW_DATA, { type: 'start', ...point, color, size });
  }

  addPoint(playerId: string, x: number, y: number): void {
    if (!this.canDraw(playerId) || !this.activeStroke) return;
    if (this.activeStroke.points.length >= MAX_POINTS_PER_STROKE) return;
    const point = this.sanitizePoint(x, y);
    if (!point) return;
    this.activeStroke.points.push(point);
    this.room.broadcastExcept(playerId, EVENTS.DRAW_DATA, { type: 'move', ...point });
  }

  /**
   * Batched version of addPoint: the client buffers points and sends them once per animation frame.
   * Invalid entries are dropped, the batch and the stroke are size-capped, the rest is forwarded as one message.
   */
  addPoints(playerId: string, raw: unknown[]): void {
    if (!this.canDraw(playerId) || !this.activeStroke) return;
    const room = MAX_POINTS_PER_STROKE - this.activeStroke.points.length;
    if (room <= 0) return;
    const points: Point[] = [];
    for (const item of raw.slice(0, Math.min(MAX_POINTS_PER_BATCH, room))) {
      const p = item as { x?: unknown; y?: unknown } | null;
      const point = this.sanitizePoint(p?.x, p?.y);
      if (point) points.push(point);
    }
    if (!points.length) return;
    this.activeStroke.points.push(...points);
    this.room.broadcastExcept(playerId, EVENTS.DRAW_DATA, { type: 'move', points });
  }

  /** Paint bucket. Stored as an op so undo, late-joiner snapshots and redraws all replay it in order. */
  fill(playerId: string, input: { x: number; y: number; color: string }): void {
    if (!this.canDraw(playerId) || this.strokes.length >= MAX_OPS_PER_TURN) return;
    const point = this.sanitizePoint(input.x, input.y);
    if (!point) return;
    const color = HEX_COLOR.test(input.color) ? input.color : '#000000';
    this.strokes.push({ kind: 'fill', color, size: 0, points: [point] });
    this.activeStroke = null;
    this.room.broadcastExcept(playerId, EVENTS.DRAW_DATA, { type: 'fill', ...point, color });
  }

  endStroke(playerId: string): void {
    if (!this.canDraw(playerId) || !this.activeStroke) return;
    this.activeStroke = null;
    this.room.broadcastExcept(playerId, EVENTS.DRAW_DATA, { type: 'end' });
  }

  undo(playerId: string): void {
    if (!this.canDraw(playerId) || this.strokes.length === 0) return;
    this.strokes.pop();
    this.activeStroke = null;
    this.room.broadcastExcept(playerId, EVENTS.DRAW_UNDO);
  }

  clearCanvas(playerId: string): void {
    if (!this.canDraw(playerId)) return;
    this.strokes = [];
    this.activeStroke = null;
    this.room.broadcastExcept(playerId, EVENTS.CANVAS_CLEAR);
  }

  // ───────────────────────── State sync ─────────────────────────

  /** Personalised snapshot — also used to bring late joiners up to speed. */
  getStateFor(viewerId: string): GameStatePayload {
    const revealWord = viewerId === this.drawerId || this._phase === 'round_end' || this._phase === 'game_over';
    return {
      phase: this._phase,
      round: this.currentRound,
      totalRounds: this.settings.rounds,
      drawerId: this.drawerId,
      hint: this.getHint(),
      word: revealWord ? this.word : null,
      timeLeftMs: this._phase === 'drawing' ? Math.max(0, this.turnEndsAt - Date.now()) : 0,
      players: this.room.getPublicPlayers(this.drawerId),
      strokes: this._phase === 'drawing' ? this.strokes : [],
    };
  }

  private broadcastState(): void {
    this.room.getPlayers().forEach((p) => this.room.sendTo(p.id, EVENTS.GAME_STATE, this.getStateFor(p.id)));
  }

  // ───────────────────────── Disconnects ─────────────────────────

  /** Room calls this when a player is removed OR marked disconnected. */
  handlePlayerGone(playerId: string): void {
    if (this._phase === 'lobby' || this._phase === 'game_over') return;
    if (this.room.connectedCount < MIN_PLAYERS_TO_START) return this.endGame();
    if (playerId === this.drawerId) return this.endTurn('drawer_left');
    if (this._phase === 'drawing') this.checkAllGuessed();
  }

  private clearTimers(): void {
    clearTimeout(this.chooseTimer);
    clearTimeout(this.turnTimer);
    clearTimeout(this.nextTurnTimer);
    this.hintTimers.forEach(clearTimeout);
    this.hintTimers = [];
  }
}
