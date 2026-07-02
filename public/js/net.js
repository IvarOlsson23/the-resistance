// Thin wrapper around the socket.io connection + localStorage session
// persistence, so reloading or losing connection mid-game can rejoin the
// same seat without anyone else's game breaking.

const socket = io({ autoConnect: true });

const listeners = {
  state: new Set(),
  privateRole: new Set(),
  actionError: new Set(),
  connect: new Set(),
  disconnect: new Set(),
};

socket.on('state', (state) => listeners.state.forEach((fn) => fn(state)));
socket.on('privateRole', (info) => listeners.privateRole.forEach((fn) => fn(info)));
socket.on('actionError', (err) => listeners.actionError.forEach((fn) => fn(err)));
socket.on('connect', () => listeners.connect.forEach((fn) => fn()));
socket.on('disconnect', () => listeners.disconnect.forEach((fn) => fn()));

function on(event, fn) {
  listeners[event].add(fn);
  return () => listeners[event].delete(fn);
}

function sessionKey(roomCode) {
  return `resistance:session:${roomCode.toUpperCase()}`;
}

function saveSession(roomCode, sessionToken, playerId) {
  try {
    localStorage.setItem(sessionKey(roomCode), JSON.stringify({ sessionToken, playerId }));
  } catch {
    /* localStorage unavailable (private mode etc.) — reconnect just won't be sticky */
  }
}

function loadSession(roomCode) {
  try {
    const raw = localStorage.getItem(sessionKey(roomCode));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function emitAsync(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res || { ok: false, message: 'Inget svar från servern.' }));
  });
}

export const net = {
  socket,
  on,

  async createLobby(name) {
    const res = await emitAsync('createLobby', { name });
    if (res.ok) saveSession(res.roomCode, res.sessionToken, res.playerId);
    return res;
  },

  async joinLobby(roomCode, name) {
    const res = await emitAsync('joinLobby', { roomCode, name });
    if (res.ok) saveSession(res.roomCode, res.sessionToken, res.playerId);
    return res;
  },

  async tryRejoin(roomCode) {
    const session = loadSession(roomCode);
    if (!session) return { ok: false, message: 'Ingen sparad session.' };
    const res = await emitAsync('rejoin', { roomCode, sessionToken: session.sessionToken });
    if (res.ok) saveSession(res.roomCode, res.sessionToken, res.playerId);
    return res;
  },

  hasSession(roomCode) {
    return !!loadSession(roomCode);
  },

  startGame() {
    return emitAsync('startGame', {});
  },

  removePlayer(targetId) {
    return emitAsync('removePlayer', { targetId });
  },

  proposeTeam(playerIds) {
    return emitAsync('proposeTeam', { playerIds });
  },

  submitVote(approve) {
    return emitAsync('submitVote', { approve });
  },

  submitMissionCard(success) {
    return emitAsync('submitMissionCard', { success });
  },
};
