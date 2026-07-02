import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const rooms = new RoomManager();

app.use(express.static(PUBLIC_DIR));

// Deep links like /lobby/AB3XK just load the SPA shell; the client reads
// the room code out of the URL itself.
app.get('/lobby/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// socket.id -> { roomCode, playerId }
const socketMap = new Map();

function broadcastState(game) {
  io.to(game.roomCode).emit('state', game.toPublicState());
}

function sendPrivateRoles(game) {
  for (const p of game.players) {
    if (!p.socketId) continue;
    const info = game.privateRoleInfo(p.id);
    if (info) io.to(p.socketId).emit('privateRole', info);
  }
}

function fail(socket, message) {
  socket.emit('actionError', { message });
}

io.on('connection', (socket) => {
  socket.on('createLobby', ({ name } = {}, cb) => {
    try {
      const game = rooms.createRoom();
      const player = game.addPlayer(name, socket.id);
      socketMap.set(socket.id, { roomCode: game.roomCode, playerId: player.id });
      socket.join(game.roomCode);
      cb?.({ ok: true, roomCode: game.roomCode, sessionToken: player.sessionToken, playerId: player.id });
      broadcastState(game);
    } catch (err) {
      cb?.({ ok: false, message: err.message });
    }
  });

  socket.on('joinLobby', ({ roomCode, name } = {}, cb) => {
    try {
      const game = rooms.getRoom(roomCode);
      if (!game) throw new Error('Hittade ingen lobby med den koden.');
      if (game.phase !== 'lobby') throw new Error('Spelet har redan startat i den lobbyn.');
      const player = game.addPlayer(name, socket.id);
      socketMap.set(socket.id, { roomCode: game.roomCode, playerId: player.id });
      socket.join(game.roomCode);
      cb?.({ ok: true, roomCode: game.roomCode, sessionToken: player.sessionToken, playerId: player.id });
      broadcastState(game);
    } catch (err) {
      cb?.({ ok: false, message: err.message });
    }
  });

  socket.on('rejoin', ({ roomCode, sessionToken } = {}, cb) => {
    try {
      const game = rooms.getRoom(roomCode);
      if (!game) throw new Error('Lobbyn finns inte längre.');
      const player = game.reconnectPlayer(sessionToken, socket.id);
      if (!player) throw new Error('Kunde inte återansluta till spelet.');
      socketMap.set(socket.id, { roomCode: game.roomCode, playerId: player.id });
      socket.join(game.roomCode);
      cb?.({ ok: true, roomCode: game.roomCode, sessionToken: player.sessionToken, playerId: player.id });
      broadcastState(game);
      if (game.phase !== 'lobby') {
        const info = game.privateRoleInfo(player.id);
        if (info) socket.emit('privateRole', info);
      }
    } catch (err) {
      cb?.({ ok: false, message: err.message });
    }
  });

  function withGame(handler) {
    return (payload, cb) => {
      try {
        const ctx = socketMap.get(socket.id);
        if (!ctx) throw new Error('Du är inte ansluten till någon lobby.');
        const game = rooms.getRoom(ctx.roomCode);
        if (!game) throw new Error('Lobbyn finns inte längre.');
        handler(game, ctx.playerId, payload || {}, cb);
      } catch (err) {
        if (cb) cb({ ok: false, message: err.message });
        else fail(socket, err.message);
      }
    };
  }

  socket.on(
    'startGame',
    withGame((game, playerId, payload, cb) => {
      const player = game.getPlayer(playerId);
      if (!player?.isHost) throw new Error('Bara värden kan starta spelet.');
      if (game.playerCount < MIN_PLAYERS) throw new Error(`Ni behöver minst ${MIN_PLAYERS} spelare för att starta.`);
      if (game.playerCount > MAX_PLAYERS) throw new Error(`Max ${MAX_PLAYERS} spelare tillåtna.`);
      game.startGame();
      cb?.({ ok: true });
      broadcastState(game);
      sendPrivateRoles(game);
      // Give clients a moment to run the role-reveal flip animation before
      // moving into team selection.
      setTimeout(() => {
        if (game.phase === 'role-reveal') {
          game.beginTeamSelect();
          broadcastState(game);
        }
      }, 6000);
    })
  );

  socket.on(
    'removePlayer',
    withGame((game, playerId, { targetId } = {}, cb) => {
      const player = game.getPlayer(playerId);
      if (!player?.isHost) throw new Error('Bara värden kan ta bort spelare.');
      game.removePlayer(targetId);
      cb?.({ ok: true });
      broadcastState(game);
    })
  );

  socket.on(
    'proposeTeam',
    withGame((game, playerId, { playerIds } = {}, cb) => {
      game.proposeTeam(playerId, playerIds || []);
      cb?.({ ok: true });
      broadcastState(game);
    })
  );

  socket.on(
    'submitVote',
    withGame((game, playerId, { approve } = {}, cb) => {
      const { allVoted } = game.castVote(playerId, approve);
      cb?.({ ok: true });
      broadcastState(game);
      if (allVoted) {
        // Phase and lastVoteReveal both land in this one broadcast; clients
        // hold the reveal animation locally for a beat before rendering
        // whatever phase comes next (mission play, or a new team proposal).
        game.resolveVote();
        broadcastState(game);
      }
    })
  );

  socket.on(
    'submitMissionCard',
    withGame((game, playerId, { success } = {}, cb) => {
      const { allSubmitted } = game.submitMissionCard(playerId, success);
      cb?.({ ok: true });
      broadcastState(game);
      if (allSubmitted) {
        game.resolveMission();
        broadcastState(game);
        setTimeout(() => {
          game.advanceAfterMission();
          broadcastState(game);
        }, 5000);
      }
    })
  );

  socket.on('disconnect', () => {
    const ctx = socketMap.get(socket.id);
    socketMap.delete(socket.id);
    if (!ctx) return;
    const game = rooms.getRoom(ctx.roomCode);
    if (!game) return;
    game.markDisconnected(socket.id);
    broadcastState(game);
  });
});

setInterval(() => rooms.sweepStale(), 30 * 60 * 1000).unref();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`The Resistance online - server listening on port ${PORT}`);
});
