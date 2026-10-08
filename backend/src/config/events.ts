/** Single source of truth for socket event names (copy to frontend in Step 3). */
export const EVENTS = {
  // Session / room lifecycle
  SESSION: 'session',
  ROOM_REJOINED: 'room_rejoined',
  LEAVE_ROOM: 'leave_room',
  LIST_ROOMS: 'list_rooms',
  REQUEST_STATE: 'request_state',
  // Room & lobby
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  JOIN_RANDOM_ROOM: 'room:join_random',
  ROOM_ERROR: 'room:error',
  UPDATE_SETTINGS: 'update_settings',
  ROOM_UPDATED: 'room_updated',
  START_GAME: 'start_game',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  // Game state
  GAME_STATE: 'game_state',
  ROUND_START: 'round_start',
  WORD_CHOSEN: 'word_chosen',
  HINT_UPDATE: 'hint_update',
  PLAYERS_UPDATE: 'players_update',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
  // Drawing
  DRAW_START: 'draw_start',
  DRAW_MOVE: 'draw_move',
  DRAW_END: 'draw_end',
  DRAW_FILL: 'draw_fill',
  DRAW_DATA: 'draw_data',
  CANVAS_CLEAR: 'canvas_clear',
  DRAW_UNDO: 'draw_undo',
  // Chat & guessing
  GUESS: 'guess',
  GUESS_RESULT: 'guess_result',
  CHAT: 'chat',
  CHAT_MESSAGE: 'chat_message',
} as const;
