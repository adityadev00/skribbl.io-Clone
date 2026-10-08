import { spawn, spawnSync } from 'node:child_process';
import { io, Socket } from 'socket.io-client';

const URL = 'http://localhost:3055';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn: () => boolean, ms = 1500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(25); }
  return fn();
};
let fails = 0;
const check = (name: string, ok: boolean, extra: unknown = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, ok ? '' : extra);
};

class Client {
  s!: Socket; id = ''; token = ''; log: { e: string; p: any }[] = [];
  constructor(public name: string) {}
  async connect(token?: string) {
    this.s = io(URL, { auth: { token }, forceNew: true, transports: ['websocket'] });
    this.s.onAny((e, p) => this.log.push({ e, p }));
    this.s.on('session', (x: any) => { this.id = x.playerId; if (x.token) this.token = x.token; });
    await new Promise<void>((r) => this.s.on('connect', () => r()));
    await sleep(100);
  }
  emit(e: string, p?: any): Promise<any> {
    return new Promise((r) => this.s.emit(e, p, (res: any) => r(res)));
  }
  got(e: string, pred: (p: any) => boolean = () => true) { return this.log.filter((l) => l.e === e && pred(l.p)); }
}

(async () => {
  const isWin = process.platform === 'win32';
  // Windows needs npx.cmd + shell:true (plain `npx` can't be spawned there). On macOS/Linux this is plain `npx`.
  const srv = spawn(isWin ? 'npx.cmd' : 'npx', ['tsx', 'src/server.ts'], {
    shell: true,
    env: { ...process.env, PORT: '3055', RECONNECT_GRACE_MS: '1500' },
    stdio: 'ignore',
  });
  // With shell:true, srv.kill() only kills the shell on Windows and leaves the server holding the port.
  const stopServer = () => (isWin && srv.pid ? spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F']) : srv.kill());
  await sleep(2500);
  const [A, B, C] = [new Client('Alice'), new Client('Bob'), new Client('Cara')];
  for (const c of [A, B, C]) await c.connect();
  check('sessions issued', !!A.id && !!A.token && A.id !== B.id);

  // Join random with nothing available
  const none = await A.emit('room:join_random', { playerName: 'Alice' });
  check('join_random: no public rooms → ack error', none.error?.code === 'NO_ROOMS_AVAILABLE', none);
  check('join_random: room:error event carries the exact message', await waitFor(() => A.got('room:error', (p) => p.message === 'No rooms are currently available').length === 1));

  const cr = await A.emit('create_room', { hostName: 'Alice', settings: { rounds: 2, drawTime: 30, hints: 1, wordCount: 2, isPrivate: false } });
  const code = cr.data.room.code;
  check('create_room', cr.ok && code.length === 5);
  check('bad settings rejected', (await B.emit('create_room', { hostName: 'x', settings: { rounds: 99 } })).error?.code === 'INVALID_SETTINGS');
  check('bad code rejected', (await B.emit('join_room', { roomId: 'ZZZZZ', playerName: 'Bob' })).error?.code === 'ROOM_NOT_FOUND');
  check('join (lowercase code)', (await B.emit('join_room', { roomId: code.toLowerCase(), playerName: 'Bob' })).ok);
  check('join 2', (await C.emit('join_room', { roomId: code, playerName: 'Cara' })).ok);
  check('A saw player_joined x2', await waitFor(() => A.got('player_joined').length === 2));
  check('list_rooms shows public room', (await B.emit('list_rooms')).data.rooms.length === 1);

  const D = new Client('Dan'); await D.connect();
  check('join_random: bad name → INVALID_NAME (not "no rooms")', (await D.emit('room:join_random', { playerName: '   ' })).error?.code === 'INVALID_NAME');
  const jr = await D.emit('room:join_random', { playerName: 'Dan' });
  check('join_random: joins the open public lobby', jr.ok && jr.data.room.code === code && jr.data.room.players.length === 4, jr);
  check('join_random: caller\'s own room is excluded', (await D.emit('room:join_random', { playerName: 'Dan' })).error?.code === 'NO_ROOMS_AVAILABLE');
  await D.emit('leave_room'); D.s.disconnect();
  check('non-host update_settings', (await B.emit('update_settings', { rounds: 3 })).error?.code === 'NOT_HOST');
  const us = await A.emit('update_settings', { rounds: 2 });
  check('host update_settings', us.ok && (await waitFor(() => B.got('room_updated').length === 1)));
  check('non-host start', (await B.emit('start_game')).error?.code === 'NOT_HOST');
  check('host start', (await A.emit('start_game')).ok);
  await sleep(200);
  const F = new Client('Fay'); await F.connect();
  check('join_random: a room already in game is not joinable', (await F.emit('room:join_random', { playerName: 'Fay' })).error?.code === 'NO_ROOMS_AVAILABLE');
  F.s.disconnect();

  const rs = A.got('round_start')[0]?.p;
  check('round_start: drawer gets options', rs?.drawerId === A.id && rs.wordOptions.length === 2, rs);
  check('round_start: others get none', B.got('round_start')[0]?.p.wordOptions.length === 0);
  const hi = await B.emit('chat', { text: 'hello' });
  check('guess before word chosen is plain chat', hi.ok && (await waitFor(() => C.got('chat_message', (p) => p.text === 'hello' && p.type === 'chat' && p.channel === 'all').length === 1)));
  check('non-drawer cannot choose word', (await B.emit('word_chosen', { word: rs.wordOptions[0] })).error?.code === 'INVALID_ACTION');
  check('invalid word', (await A.emit('word_chosen', { word: 'nonsense' })).error?.code === 'INVALID_WORD');
  const word: string = rs.wordOptions[0];
  check('choose word', (await A.emit('word_chosen', { word: word.toUpperCase() })).ok);
  await sleep(200);
  check('game_state: drawer sees word', A.got('game_state').at(-1)?.p.word === word);
  check('game_state: guesser does not', B.got('game_state').at(-1)?.p.word === null && !JSON.stringify(B.log).includes(`"${word}"`));

  // Drawing sync
  A.s.emit('draw_start', { x: 0.2, y: 0.3, color: '#ff0000', size: 8 });
  A.s.emit('draw_move', { x: 0.4, y: 5 });
  A.s.emit('draw_end');
  B.s.emit('draw_start', { x: 0.9, y: 0.9, color: '#000000', size: 3 }); // spoof
  await sleep(200);
  const dd = C.got('draw_data').map((l) => l.p);
  check('guesser receives draw stream (start/move/end)', dd.map((d) => d.type).join() === 'start,move,end', dd);
  check('y clamped to 1', dd[1]?.y === 1);
  check('drawer not echoed', A.got('draw_data').length === 0);
  check('spoofed draw ignored', !dd.some((d) => d.x === 0.9));
  A.s.emit('draw_fill', { x: 0.5, y: 0.5, color: '#00ff00' });
  B.s.emit('draw_fill', { x: 0.1, y: 0.1, color: '#ff00ff' }); // spoof
  await sleep(200);
  check('fill broadcast to guessers', C.got('draw_data').filter((l) => l.p.type === 'fill').length === 1);
  const snap = (await C.emit('request_state')).data.state;
  check('snapshot keeps stroke + fill ops in order', snap.strokes.map((x: any) => x.kind).join() === 'stroke,fill', snap.strokes);
  // Batched draw_move (one message per animation frame on the client)
  A.s.emit('draw_start', { x: 0.2, y: 0.2, color: '#0000ff', size: 6 });
  A.s.emit('draw_move', { points: [{ x: 0.25, y: 0.25 }, { x: 0.3, y: 7 }, { x: 'bad', y: 1 }, null] });
  A.s.emit('draw_move', { points: Array.from({ length: 200 }, (_, i) => ({ x: 0.3 + i / 1000, y: 0.5 })) });
  A.s.emit('draw_end');
  B.s.emit('draw_move', { points: [{ x: 0.9, y: 0.9 }] }); // spoof
  await sleep(250);
  const batches = C.got('draw_data').map((l) => l.p).filter((d) => d.type === 'move' && d.points);
  check('batched draw_move: invalid points dropped, y clamped', batches[0]?.points.length === 2 && batches[0].points[1].y === 1, batches[0]);
  check('batched draw_move: batch capped at 64 points', batches[1]?.points.length === 64, batches[1]?.points.length);
  check('batched draw_move: spoofed batch ignored', !batches.some((d) => d.points.some((p: any) => p.x === 0.9)));
  A.s.emit('draw_undo'); A.s.emit('canvas_clear'); await sleep(150);
  check('undo + clear broadcast', C.got('draw_undo').length === 1 && C.got('canvas_clear').length >= 2);

  // Guessing & masking
  await B.emit('guess', { text: 'definitelywrong' });
  check('wrong guess visible to all', await waitFor(() => C.got('chat_message', (p) => p.text === 'definitelywrong' && p.type === 'guess').length === 1));
  await B.emit('guess', { text: `  ${word.toUpperCase()}  ` });
  await sleep(150);
  check('guess_result broadcast w/ points', C.got('guess_result', (p) => p.correct && p.playerId === B.id && p.points > 100).length === 1);
  check('correct guess text NOT in chat', C.got('chat_message', (p) => String(p.text).toLowerCase().includes(word)).length === 0 && A.got('chat_message', (p) => String(p.text).toLowerCase().includes(word)).length === 0);
  check('players_update with scores', C.got('players_update').at(-1)?.p.players.find((x: any) => x.id === B.id).score > 0);
  await B.emit('chat', { text: `it is ${word}` });
  await sleep(100);
  check('guessed-channel chat reaches drawer+guessed only', A.got('chat_message', (p) => p.channel === 'guessed').length === 1 && C.got('chat_message', (p) => p.channel === 'guessed').length === 0);
  check('rate limit', (await Promise.all(Array.from({ length: 10 }, () => C.emit('chat', { text: 'spam' })))).some((r) => r.error?.code === 'RATE_LIMITED'));

  // Disconnect of the only remaining non-guesser → everyone connected has guessed → turn ends
  C.s.disconnect(); await sleep(300);
  check('C marked disconnected, not removed', A.got('players_update').at(-1)?.p.players.find((x: any) => x.id === C.id)?.isConnected === false);
  check('turn ended (all connected guessed)', A.got('round_end').at(-1)?.p.reason === 'all_guessed');

  // Reconnect within grace
  const C2 = new Client('Cara2'); await C2.connect(C.token);
  await sleep(200);
  const rj = C2.got('room_rejoined')[0]?.p;
  check('reconnect keeps same playerId', C2.id === C.id);
  check('room_rejoined snapshot', rj?.room.code === code && rj.room.players.length === 3 && rj.state?.phase === 'round_end', rj);
  check('others see C online again', A.got('players_update').at(-1)?.p.players.find((x: any) => x.id === C.id)?.isConnected === true);
  const wb = await B.emit('chat', { text: 'welcome back' });
  check('rejoined socket still receives room events', wb.ok && (await waitFor(() => C2.got('chat_message', (p) => p.text === 'welcome back').length === 1)));

  // Grace expiry
  C2.s.disconnect(); await sleep(2200);
  const pl = A.got('player_left').at(-1)?.p;
  check('evicted after grace', pl?.playerId === C.id && pl.players.length === 2, pl);
  const C3 = new Client('Cara3'); await C3.connect(C.token);
  check('expired token → new identity, no room', C3.id !== C.id && C3.got('room_rejoined').length === 0);

  // Drawer disconnect mid-turn + game over when <2 connected
  await sleep(5500); // let next turn begin (B drawing now)
  const st = (await A.emit('request_state')).data.state;
  check('next turn started with new drawer', st.phase === 'choosing' && st.drawerId === B.id, st);
  B.s.disconnect(); await sleep(300);
  check('drawer disconnect → game over (only 1 connected)', A.got('game_over').length === 1 && A.got('game_over')[0].p.leaderboard.length === 2);

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  stopServer(); process.exit(fails ? 1 : 0);
})();
