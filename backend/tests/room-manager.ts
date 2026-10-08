/** Unit test for RoomManager.findRandomPublicRoom — no sockets needed. Run: npm run test:unit */
import { RoomManager } from '../src/services/RoomManager';
import type { Broadcaster } from '../src/types';

const silent: Broadcaster = { toRoom() {}, toRoomExcept() {}, toPlayer() {} };
let fails = 0;
const check = (name: string, ok: boolean, extra: unknown = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, ok ? '' : extra);
};

const rm = new RoomManager(silent);
check('no rooms → undefined', rm.findRandomPublicRoom('x') === undefined);

const priv = rm.createRoom('p1', 'Priv', { isPrivate: true });
check('private room is never returned', rm.findRandomPublicRoom('x') === undefined);

const pub = rm.createRoom('u1', 'Pub', { isPrivate: false, maxPlayers: 2 });
check('public lobby is returned', rm.findRandomPublicRoom('x')?.code === pub.code);
check("caller's own room is excluded", rm.findRandomPublicRoom('u1') === undefined);

rm.joinRoom(pub.code, 'u2', 'Two');
check('full room is excluded', rm.findRandomPublicRoom('x') === undefined);

rm.leave('u2');
check('room with a free seat is returned again', rm.findRandomPublicRoom('x')?.code === pub.code);

rm.joinRoom(pub.code, 'u2', 'Two');
pub.startGame('u1');
rm.leave('u2'); // one seat free again, but a game is running
check('room already in a game is excluded', pub.phase !== 'lobby' && rm.findRandomPublicRoom('x') === undefined);

const ghost = rm.createRoom('g1', 'Ghost', { isPrivate: false });
rm.handleDisconnect('g1'); // everyone offline (seat held during grace)
check('room with nobody online is excluded', rm.findRandomPublicRoom('x') === undefined);

// distribution: 3 eligible rooms, 600 draws → each should be picked often (expected 200)
const open = ['a', 'b', 'c'].map((id) => rm.createRoom(id, id.toUpperCase(), { isPrivate: false }));
const hits = new Map<string, number>();
for (let i = 0; i < 600; i++) {
  const r = rm.findRandomPublicRoom('x')!;
  hits.set(r.code, (hits.get(r.code) ?? 0) + 1);
}
check('selection is spread across all eligible rooms', open.every((r) => (hits.get(r.code) ?? 0) > 120), [...hits.values()]);

[priv, pub, ghost, ...open].forEach((r) => r.getPlayers().forEach((p) => rm.leave(p.id))); // clears timers
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
