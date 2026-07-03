import { randomUUID } from 'crypto';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  SPY_COUNTS,
  TEAM_SIZES,
  requiredFails,
  twoFailMissionIndex,
  MAX_CONSECUTIVE_REJECTIONS,
  MISSIONS_TO_WIN,
} from './constants.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Game holds all authoritative state for a single room/lobby.
 * Phases: lobby -> role-reveal -> team-select -> voting -> mission -> mission-result
 *         -> (loop team-select) -> game-over
 */
export class Game {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.phase = 'lobby';
    this.createdAt = Date.now();
    this.players = []; // { id, sessionToken, name, connected, isHost, socketId }
    this.leaderIndex = 0;
    this.missionNumber = 1; // 1-5
    this.proposalNumber = 1; // attempt number within the current mission (resets each mission)
    this.rejectionCount = 0; // consecutive rejections across the whole game
    this.currentTeam = []; // array of player ids
    this.votes = new Map(); // playerId -> boolean (approve)
    this.missionCards = new Map(); // playerId -> boolean (success)
    this.missions = []; // { teamSize, requiredFails, status: 'pending'|'success'|'fail', failCount }
    this.roles = new Map(); // playerId -> 'resistance' | 'spy'
    this.winner = null; // 'resistance' | 'spies'
    this.winReason = null;
    this.lastVoteReveal = null; // transient: { votes: {id: bool}, approved, proposalNumber }
    this.lastMissionReveal = null; // transient: { missionNumber, failCount, result }
    this.log = []; // { id, at, text } — chronological, player-visible event log
    this._logSeq = 0;
  }

  addLog(text) {
    this.log.push({ id: ++this._logSeq, at: Date.now(), text });
  }

  get playerCount() {
    return this.players.length;
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getPlayerBySocket(socketId) {
    return this.players.find((p) => p.socketId === socketId);
  }

  addPlayer(name, socketId) {
    if (this.phase !== 'lobby') throw new Error('The game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new Error('The lobby is full (max 10 players).');
    const trimmed = (name || '').trim().slice(0, 20) || 'Spelare';
    const id = randomUUID();
    const sessionToken = randomUUID();
    const isHost = this.players.length === 0;
    this.players.push({ id, sessionToken, name: trimmed, connected: true, isHost, socketId });
    return this.getPlayer(id);
  }

  reconnectPlayer(sessionToken, socketId) {
    const player = this.players.find((p) => p.sessionToken === sessionToken);
    if (!player) return null;
    player.connected = true;
    player.socketId = socketId;
    return player;
  }

  markDisconnected(socketId) {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return null;
    player.connected = false;
    player.socketId = null;
    // Host migration only matters pre-game; if the host drops, hand it to the
    // next connected player so the lobby never gets stuck without a starter.
    if (player.isHost && this.phase === 'lobby') {
      const next = this.players.find((p) => p.connected && p.id !== player.id);
      if (next) {
        player.isHost = false;
        next.isHost = true;
      }
    }
    return player;
  }

  removePlayer(playerId) {
    if (this.phase !== 'lobby') throw new Error('Can only remove players while in the lobby.');
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const wasHost = this.players[idx].isHost;
    this.players.splice(idx, 1);
    if (wasHost && this.players.length > 0) this.players[0].isHost = true;
  }

  canStart() {
    return this.phase === 'lobby' && this.playerCount >= MIN_PLAYERS && this.playerCount <= MAX_PLAYERS;
  }

  startGame() {
    if (!this.canStart()) throw new Error('Cannot start the game right now.');
    const n = this.playerCount;
    const spyCount = SPY_COUNTS[n];
    const shuffledIds = shuffle(this.players.map((p) => p.id));
    shuffledIds.forEach((id, i) => {
      this.roles.set(id, i < spyCount ? 'spy' : 'resistance');
    });
    this.missions = TEAM_SIZES[n].map((teamSize, idx) => ({
      teamSize,
      requiredFails: requiredFails(n, idx),
      status: 'pending',
      failCount: null,
    }));
    this.leaderIndex = Math.floor(Math.random() * n);
    this.phase = 'role-reveal';
    this.addLog(`The mission begins. ${n} players, ${spyCount} of them Spies. Roles have been dealt in secret.`);
  }

  beginTeamSelect() {
    this.phase = 'team-select';
    this.currentTeam = [];
    this.votes.clear();
    this.lastVoteReveal = null;
  }

  get leader() {
    return this.players[this.leaderIndex];
  }

  requiredTeamSize() {
    return this.missions[this.missionNumber - 1].teamSize;
  }

  proposeTeam(leaderId, playerIds) {
    if (this.phase !== 'team-select') throw new Error('Wrong phase for picking a team.');
    if (this.leader.id !== leaderId) throw new Error('Only the leader can pick the team.');
    const required = this.requiredTeamSize();
    const unique = [...new Set(playerIds)];
    if (unique.length !== required) throw new Error(`The team must have exactly ${required} players.`);
    for (const id of unique) {
      if (!this.getPlayer(id)) throw new Error('Invalid player in the team.');
    }
    this.currentTeam = unique;
    this.phase = 'voting';
    this.votes.clear();
    const names = unique.map((id) => this.getPlayer(id).name).join(', ');
    this.addLog(`${this.getPlayer(leaderId).name} sent out a team for Mission ${this.missionNumber}: ${names}.`);
  }

  castVote(playerId, approve) {
    if (this.phase !== 'voting') throw new Error('Wrong phase for voting.');
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Unknown player.');
    if (this.votes.has(playerId)) return { allVoted: this.votes.size === this.playerCount };
    this.votes.set(playerId, !!approve);
    this.addLog(`${player.name} cast their vote.`);
    const allVoted = this.votes.size === this.playerCount;
    return { allVoted };
  }

  resolveVote() {
    const voteRecord = {};
    let approveCount = 0;
    for (const p of this.players) {
      const v = this.votes.get(p.id) === true;
      voteRecord[p.id] = v;
      if (v) approveCount++;
    }
    const rejectCount = this.playerCount - approveCount;
    const approved = approveCount > rejectCount;
    this.lastVoteReveal = {
      votes: voteRecord,
      approved,
      proposalNumber: this.proposalNumber,
      missionNumber: this.missionNumber,
    };

    if (approved) {
      this.addLog(`Team APPROVED for Mission ${this.missionNumber} (${approveCount} for, ${rejectCount} against).`);
      this.rejectionCount = 0;
      this.phase = 'mission';
      this.missionCards.clear();
      return { approved, gameOver: false };
    }

    this.rejectionCount++;
    if (this.rejectionCount >= MAX_CONSECUTIVE_REJECTIONS) {
      this.addLog(`Team REJECTED (${approveCount} for, ${rejectCount} against). Five proposals in a row have been rejected.`);
      this.winner = 'spies';
      this.winReason = 'rejections';
      this.phase = 'game-over';
      this.addLog('GAME OVER — The Spies win! Five team proposals in a row were rejected.');
      return { approved, gameOver: true };
    }

    this.proposalNumber++;
    this.leaderIndex = (this.leaderIndex + 1) % this.playerCount;
    this.currentTeam = [];
    this.phase = 'team-select';
    this.addLog(`Team REJECTED (${approveCount} for, ${rejectCount} against). Leadership passes to ${this.leader.name}.`);
    return { approved, gameOver: false };
  }

  isOnTeam(playerId) {
    return this.currentTeam.includes(playerId);
  }

  canPlayFailCard(playerId) {
    return this.roles.get(playerId) === 'spy';
  }

  submitMissionCard(playerId, success) {
    if (this.phase !== 'mission') throw new Error('Wrong phase for mission cards.');
    if (!this.isOnTeam(playerId)) throw new Error("You're not on the team for this mission.");
    if (this.missionCards.has(playerId)) {
      return { allSubmitted: this.missionCards.size === this.currentTeam.length };
    }
    const isResistance = this.roles.get(playerId) === 'resistance';
    const card = isResistance ? true : !!success; // resistance can only ever play success
    this.missionCards.set(playerId, card);
    this.addLog(`${this.getPlayer(playerId).name} played their mission card.`);
    const allSubmitted = this.missionCards.size === this.currentTeam.length;
    return { allSubmitted };
  }

  resolveMission() {
    const mission = this.missions[this.missionNumber - 1];
    const cards = shuffle([...this.missionCards.values()]);
    const failCount = cards.filter((c) => c === false).length;
    const failed = failCount >= mission.requiredFails;
    mission.status = failed ? 'fail' : 'success';
    mission.failCount = failCount;
    this.lastMissionReveal = {
      missionNumber: this.missionNumber,
      failCount,
      result: mission.status,
      teamSize: mission.teamSize,
    };
    this.phase = 'mission-result';
    this.addLog(
      `Mission ${this.missionNumber} ${failed ? 'FAILED' : 'SUCCEEDED'} (${failCount} sabotage card${failCount === 1 ? '' : 's'} out of ${mission.teamSize}).`
    );

    const successes = this.missions.filter((m) => m.status === 'success').length;
    const fails = this.missions.filter((m) => m.status === 'fail').length;

    if (successes >= MISSIONS_TO_WIN) {
      this.winner = 'resistance';
      this.winReason = 'missions';
      this.addLog(`GAME OVER — The Resistance wins! ${successes} missions succeeded.`);
    } else if (fails >= MISSIONS_TO_WIN) {
      this.winner = 'spies';
      this.winReason = 'missions';
      this.addLog(`GAME OVER — The Spies win! ${fails} missions failed.`);
    }
    return { mission };
  }

  advanceAfterMission() {
    if (this.winner) {
      this.phase = 'game-over';
      return;
    }
    this.missionNumber++;
    this.proposalNumber = 1;
    this.rejectionCount = 0;
    this.leaderIndex = (this.leaderIndex + 1) % this.playerCount;
    this.beginTeamSelect();
  }

  twoFailMissionIndex() {
    return twoFailMissionIndex(this.playerCount);
  }

  // ---- Serialization -------------------------------------------------

  publicPlayers() {
    return this.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.isHost,
      isLeader: idx === this.leaderIndex,
      seat: idx,
    }));
  }

  votingStatus() {
    return this.players.map((p) => p.id).filter((id) => this.votes.has(id));
  }

  missionSubmitStatus() {
    return this.currentTeam.filter((id) => this.missionCards.has(id));
  }

  toPublicState() {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      players: this.publicPlayers(),
      leaderId: this.leader ? this.leader.id : null,
      missionNumber: this.missionNumber,
      proposalNumber: this.proposalNumber,
      rejectionCount: this.rejectionCount,
      missions: this.missions.map((m) => ({
        teamSize: m.teamSize,
        requiredFails: m.requiredFails,
        status: m.status,
        failCount: m.status === 'pending' ? null : m.failCount,
      })),
      currentTeam: this.currentTeam,
      votedPlayerIds: this.phase === 'voting' ? this.votingStatus() : [],
      missionSubmittedIds: this.phase === 'mission' ? this.missionSubmitStatus() : [],
      lastVoteReveal: this.lastVoteReveal,
      lastMissionReveal: this.lastMissionReveal,
      winner: this.winner,
      winReason: this.winReason,
      gameOverRoles:
        this.phase === 'game-over'
          ? this.players.map((p) => ({ id: p.id, name: p.name, role: this.roles.get(p.id) }))
          : null,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      spyCount: SPY_COUNTS[this.playerCount] || null,
      log: this.log,
    };
  }

  privateRoleInfo(playerId) {
    const role = this.roles.get(playerId);
    if (!role) return null;
    const spies =
      role === 'spy'
        ? this.players
            .filter((p) => this.roles.get(p.id) === 'spy' && p.id !== playerId)
            .map((p) => ({ id: p.id, name: p.name }))
        : null;
    return { role, spies };
  }
}
