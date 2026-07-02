import { customAlphabet } from 'nanoid';
import { Game } from './game.js';

// Avoid ambiguous characters (0/O, 1/I) in shareable room codes.
const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Game
  }

  createRoom() {
    let code;
    do {
      code = generateCode();
    } while (this.rooms.has(code));
    const game = new Game(code);
    this.rooms.set(code, game);
    return game;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  // Rooms with no connected players and no activity for a while are swept
  // periodically so memory doesn't grow unbounded on a long-running server.
  sweepStale(maxAgeMs = 6 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [code, game] of this.rooms) {
      const anyConnected = game.players.some((p) => p.connected);
      if (!anyConnected && now - game.createdAt > maxAgeMs) {
        this.rooms.delete(code);
      }
    }
  }
}
