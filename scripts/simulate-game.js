// Headless integration test: spins up the real server, drives a full game
// with socket.io-client bots, and asserts the rules engine behaves per spec.
// Run with: node scripts/simulate-game.js [playerCount]
import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from '../server/rooms.js';
import { MIN_PLAYERS, MAX_PLAYERS, SPY_COUNTS, TEAM_SIZES } from '../server/constants.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const rooms = new RoomManager();
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

  io.on('connection', (socket) => {
    socket.on('createLobby', ({ name } = {}, cb) => {
      const game = rooms.createRoom();
      const player = game.addPlayer(name, socket.id);
      socketMap.set(socket.id, { roomCode: game.roomCode, playerId: player.id });
      socket.join(game.roomCode);
      cb?.({ ok: true, roomCode: game.roomCode, sessionToken: player.sessionToken, playerId: player.id });
      broadcastState(game);
    });
    socket.on('joinLobby', ({ roomCode, name } = {}, cb) => {
      try {
        const game = rooms.getRoom(roomCode);
        if (!game) throw new Error('no room');
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
      const game = rooms.getRoom(roomCode);
      if (!game) return cb?.({ ok: false, message: 'no room' });
      const player = game.reconnectPlayer(sessionToken, socket.id);
      if (!player) return cb?.({ ok: false, message: 'no player' });
      socketMap.set(socket.id, { roomCode: game.roomCode, playerId: player.id });
      socket.join(game.roomCode);
      cb?.({ ok: true, roomCode: game.roomCode, sessionToken: player.sessionToken, playerId: player.id });
      broadcastState(game);
      const info = game.privateRoleInfo(player.id);
      if (info) socket.emit('privateRole', info);
    });
    function withGame(handler) {
      return (payload, cb) => {
        try {
          const ctx = socketMap.get(socket.id);
          const game = rooms.getRoom(ctx.roomCode);
          handler(game, ctx.playerId, payload || {}, cb);
        } catch (err) {
          cb?.({ ok: false, message: err.message });
        }
      };
    }
    socket.on(
      'startGame',
      withGame((game, playerId, payload, cb) => {
        game.startGame();
        cb?.({ ok: true });
        broadcastState(game);
        sendPrivateRoles(game);
        setTimeout(() => {
          if (game.phase === 'role-reveal') {
            game.beginTeamSelect();
            broadcastState(game);
          }
        }, 150); // shortened for test speed
      })
    );
    socket.on(
      'proposeTeam',
      withGame((game, playerId, { playerIds }, cb) => {
        game.proposeTeam(playerId, playerIds || []);
        cb?.({ ok: true });
        broadcastState(game);
      })
    );
    socket.on(
      'submitVote',
      withGame((game, playerId, { approve }, cb) => {
        const { allVoted } = game.castVote(playerId, approve);
        cb?.({ ok: true });
        broadcastState(game);
        if (allVoted) {
          game.resolveVote();
          broadcastState(game);
        }
      })
    );
    socket.on(
      'submitMissionCard',
      withGame((game, playerId, { success }, cb) => {
        const { allSubmitted } = game.submitMissionCard(playerId, success);
        cb?.({ ok: true });
        broadcastState(game);
        if (allSubmitted) {
          game.resolveMission();
          broadcastState(game);
          setTimeout(() => {
            game.advanceAfterMission();
            broadcastState(game);
          }, 50);
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

  return new Promise((resolve) => {
    httpServer.listen(0, () => resolve({ httpServer, io, port: httpServer.address().port }));
  });
}

function makeBot(url, name) {
  const socket = ioClient(url, { transports: ['websocket'] });
  const bot = {
    name,
    socket,
    state: null,
    role: null,
    roomCode: null,
    sessionToken: null,
    playerId: null,
  };
  socket.on('state', (s) => (bot.state = s));
  socket.on('privateRole', (info) => (bot.role = info));
  socket.on('actionError', (e) => console.error(`[${name}] actionError:`, e.message));
  bot.emit = (event, payload) =>
    new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res)));
  return bot;
}

function waitFor(fn, timeoutMs = 4000, intervalMs = 20) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

async function runSimulation(playerCount) {
  console.log(`\n=== Simulating a ${playerCount}-player game ===`);
  const { httpServer, port } = await startServer();
  const url = `http://localhost:${port}`;

  const host = makeBot(url, 'Bot-0');
  const createRes = await host.emit('createLobby', { name: host.name });
  assert(createRes.ok, 'create lobby failed: ' + createRes.message);
  const roomCode = createRes.roomCode;
  Object.assign(host, createRes);

  const bots = [host];
  for (let i = 1; i < playerCount; i++) {
    const bot = makeBot(url, `Bot-${i}`);
    const res = await bot.emit('joinLobby', { roomCode, name: bot.name });
    assert(res.ok, `join failed for bot ${i}: ${res.message}`);
    Object.assign(bot, res);
    bots.push(bot);
  }

  await waitFor(() => host.state && host.state.players.length === playerCount);
  assert(host.state.players.length === playerCount, 'not all players registered');

  const startRes = await host.emit('startGame', {});
  assert(startRes.ok, 'startGame failed: ' + startRes.message);

  await waitFor(() => bots.every((b) => b.role));
  const spyNames = bots.filter((b) => b.role.role === 'spy').map((b) => b.name);
  assert(spyNames.length === SPY_COUNTS[playerCount], `expected ${SPY_COUNTS[playerCount]} spies, got ${spyNames.length}`);
  for (const b of bots) {
    if (b.role.role === 'spy') {
      assert(b.role.spies.length === spyNames.length - 1, 'spy should see all other spies');
    } else {
      assert(b.role.spies === null, 'resistance should not see spy list');
    }
  }
  console.log(`Spies: ${spyNames.join(', ')}`);

  await waitFor(() => host.state.phase === 'team-select', 8000);

  let missionsPlayed = 0;
  const teamSizes = TEAM_SIZES[playerCount];

  while (host.state.phase !== 'game-over' && missionsPlayed < 12) {
    await waitFor(() => host.state.phase === 'team-select' || host.state.phase === 'game-over', 4000);
    if (host.state.phase === 'game-over') break;
    const leaderId = host.state.leaderId;
    const leaderBot = bots.find((b) => b.playerId === leaderId);
    const required = host.state.missions[host.state.missionNumber - 1].teamSize;
    assert(required === teamSizes[host.state.missionNumber - 1], 'team size mismatch with rules table');

    const proposal = bots.slice(0, required).map((b) => b.playerId);
    const proposeRes = await leaderBot.emit('proposeTeam', { playerIds: proposal });
    assert(proposeRes.ok, 'proposeTeam failed: ' + proposeRes.message);

    await waitFor(() => host.state.phase === 'voting');
    // Always approve so the game progresses deterministically to mission play.
    await Promise.all(bots.map((b) => b.emit('submitVote', { approve: true })));

    await waitFor(() => host.state.phase === 'mission' || host.state.phase === 'game-over', 4000);
    if (host.state.phase === 'game-over') break;

    const team = bots.filter((b) => proposal.includes(b.playerId));
    await Promise.all(
      team.map((b) => {
        const isSpy = b.role.role === 'spy';
        // Spies fail on odd mission numbers so we exercise both outcomes.
        const success = !isSpy || host.state.missionNumber % 2 === 0;
        return b.emit('submitMissionCard', { success });
      })
    );

    await waitFor(() => host.state.phase !== 'mission', 4000);
    missionsPlayed++;
    console.log(`Mission ${missionsPlayed} resolved -> phase now ${host.state.phase}, missions:`, host.state.missions.map((m) => m.status).join(','));
  }

  await waitFor(() => host.state.phase === 'game-over', 6000);
  assert(['resistance', 'spies'].includes(host.state.winner), 'winner should be decided');
  assert(host.state.gameOverRoles.length === playerCount, 'gameOverRoles should list everyone');
  console.log(`Game over. Winner: ${host.state.winner} (${host.state.winReason})`);

  // --- Reconnect test: drop bot 1 mid-lobby-of-next-game context is moot since
  // game already ended; instead verify mid-game reconnect using a fresh game. ---
  await testReconnect(url);

  bots.forEach((b) => b.socket.close());
  httpServer.close();
}

async function testReconnect(url) {
  console.log('\n=== Reconnect test ===');
  const host = makeBot(url, 'R-Host');
  const createRes = await host.emit('createLobby', { name: host.name });
  Object.assign(host, createRes);
  const roomCode = createRes.roomCode;

  const others = [];
  for (let i = 1; i < 5; i++) {
    const bot = makeBot(url, `R-${i}`);
    const res = await bot.emit('joinLobby', { roomCode, name: bot.name });
    Object.assign(bot, res);
    others.push(bot);
  }
  const all = [host, ...others];
  await waitFor(() => host.state && host.state.players.length === 5);
  await host.emit('startGame', {});
  await waitFor(() => all.every((b) => b.role));

  // Disconnect one non-host player mid-game (during role-reveal / team-select window).
  const victim = others[0];
  const victimId = victim.playerId;
  const victimToken = victim.sessionToken;
  victim.socket.close();

  await waitFor(() => host.state.players.find((p) => p.id === victimId)?.connected === false, 4000);
  assert(true, 'disconnect reflected in state');

  const revived = makeBot(url, 'R-1-rejoined');
  const rejoinRes = await revived.emit('rejoin', { roomCode, sessionToken: victimToken });
  assert(rejoinRes.ok, 'rejoin failed: ' + rejoinRes.message);
  assert(rejoinRes.playerId === victimId, 'rejoin should restore the same player id');

  await waitFor(() => host.state.players.find((p) => p.id === victimId)?.connected === true, 4000);
  await waitFor(() => !!revived.role, 4000);
  assert(revived.role.role === victim.role.role, 'reconnected player should keep the same role');
  console.log('Reconnect preserved identity and role correctly.');

  all.filter((b) => b !== victim).forEach((b) => b.socket.close());
  revived.socket.close();
}

async function main() {
  for (const n of [5, 7, 10]) {
    await runSimulation(n);
  }
  console.log('\nALL SIMULATIONS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
