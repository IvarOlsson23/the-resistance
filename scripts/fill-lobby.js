import { io as ioClient } from 'socket.io-client';

const roomCode = process.argv[2];
const url = 'http://localhost:3000';
if (!roomCode) {
  console.error('usage: node fill-lobby.js ROOMCODE');
  process.exit(1);
}

const names = ['Nina', 'Oskar', 'Freja', 'Leo'];
const bots = [];

async function main() {
  for (const name of names) {
    const socket = ioClient(url, { transports: ['websocket'] });
    await new Promise((resolve) => socket.on('connect', resolve));
    const res = await new Promise((resolve) => socket.emit('joinLobby', { roomCode, name }, resolve));
    if (!res.ok) {
      console.error(`join failed for ${name}:`, res.message);
      continue;
    }
    console.log(`${name} joined as ${res.playerId}`);
    const bot = { name, socket, playerId: res.playerId, state: null, role: null };
    socket.on('state', (s) => (bot.state = s));
    socket.on('privateRole', (info) => (bot.role = info));
    bots.push(bot);
  }
  console.log('All bots joined and holding connections open. Press Ctrl+C to exit.');

  // Once the game starts, auto-play: always approve, always play success,
  // so the human tester can watch the table advance through every phase.
  setInterval(async () => {
    const any = bots.find((b) => b.state);
    if (!any || !any.state) return;
    const state = any.state;
    if (state.phase === 'team-select') {
      const leaderBot = bots.find((b) => b.playerId === state.leaderId);
      if (leaderBot) {
        const required = state.missions[state.missionNumber - 1].teamSize;
        const ids = [any.playerId, ...bots.map((b) => b.playerId)].filter((v, i, a) => a.indexOf(v) === i).slice(0, required);
        await new Promise((r) => leaderBot.socket.emit('proposeTeam', { playerIds: ids }, r));
      }
    } else if (state.phase === 'voting') {
      for (const b of bots) {
        if (!state.votedPlayerIds.includes(b.playerId)) {
          b.socket.emit('submitVote', { approve: true }, () => {});
        }
      }
    } else if (state.phase === 'mission') {
      for (const b of bots) {
        if (state.currentTeam.includes(b.playerId) && !state.missionSubmittedIds.includes(b.playerId)) {
          b.socket.emit('submitMissionCard', { success: true }, () => {});
        }
      }
    }
  }, 1500);
}

main();
