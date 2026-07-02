import { net } from './net.js';
import {
  avatarSVG,
  cardBackSVG,
  resistanceCardSVG,
  spyCardSVG,
  leaderBadgeSVG,
  approveIconSVG,
  rejectIconSVG,
  successIconSVG,
  failIconSVG,
} from './svg.js';

const appEl = document.getElementById('app');
const toastRoot = document.getElementById('toast-root');

// ---------------------------------------------------------------------------
// Session / top-level state
// ---------------------------------------------------------------------------
let activeRoomCode = getCodeFromPath();
let myPlayerId = null;
let myName = '';
let myRole = null; // { role, spies }
let latestState = null;
let prevState = null;
let joinPrefillError = null;

let shownRoleForPhaseKey = null;
let shownVoteRevealKey = null;
let shownMissionRevealKey = null;
let gameOverShown = false;
let gameViewMounted = false;

function getCodeFromPath() {
  const m = window.location.pathname.match(/\/lobby\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

net.on('connect', async () => {
  // Only relevant for (re)establishing a game we already knew about — a
  // first-time visitor's initial screen is rendered synchronously below and
  // shouldn't be redrawn out from under them while they're typing.
  if (activeRoomCode && net.hasSession(activeRoomCode)) {
    const res = await net.tryRejoin(activeRoomCode);
    if (res.ok) {
      myPlayerId = res.playerId;
      activeRoomCode = res.roomCode;
    } else if (!latestState) {
      joinPrefillError = res.message;
      renderPreGame();
    }
  }
});

net.on('disconnect', () => {
  if (latestState) toast('Tappade anslutningen — försöker återansluta...');
});

net.on('actionError', (err) => toast(err.message || 'Något gick fel.'));

net.on('privateRole', (info) => {
  myRole = info;
  maybeShowRoleReveal();
});

net.on('state', (state) => {
  prevState = latestState;
  latestState = state;
  const me = state.players.find((p) => p.id === myPlayerId);
  if (me) myName = me.name;
  route();
});

function route() {
  if (!latestState) return renderPreGame();
  if (latestState.phase === 'lobby') return renderLobbyWaiting(latestState);
  return renderGame(latestState, prevState);
}

// ---------------------------------------------------------------------------
// Pre-game: landing / create / join
// ---------------------------------------------------------------------------
function renderPreGame() {
  if (activeRoomCode) return renderJoinWithCode(activeRoomCode);
  return renderLanding();
}

function renderLanding() {
  appEl.innerHTML = `
    <div class="landing">
      <div class="landing__badge">${leaderBadgeSVG()}</div>
      <h1 class="landing__title">Hemligt Uppdrag</h1>
      <p class="landing__subtitle">The Resistance — samla ditt team, lita på varandra (eller inte), och avslöja spionerna innan det är för sent.</p>
      <div class="action-stack">
        <button class="dossier-btn dossier-btn--primary" id="btnCreate">
          <span class="dossier-btn__icon">${shieldIconInline()}</span>
          <span class="dossier-btn__label">
            <span class="dossier-btn__title">Skapa nytt uppdrag</span>
            <span class="dossier-btn__hint">Bli värd och bjud in dina kontakter</span>
          </span>
        </button>
        <button class="dossier-btn" id="btnJoin">
          <span class="dossier-btn__icon">${keyIconInline()}</span>
          <span class="dossier-btn__label">
            <span class="dossier-btn__title">Gå med i uppdrag</span>
            <span class="dossier-btn__hint">Du har fått en lobbykod</span>
          </span>
        </button>
      </div>
      <div id="formSlot"></div>
    </div>
  `;
  document.getElementById('btnCreate').onclick = () => renderNameForm({ mode: 'create' });
  document.getElementById('btnJoin').onclick = () => renderNameForm({ mode: 'join' });
}

function shieldIconInline() {
  return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 3l12 4.5v8c0 8-5.4 14-12 16.5C11.4 29.5 6 23.5 6 15.5v-8L18 3z" stroke="#e8c766" stroke-width="2"/></svg>`;
}
function keyIconInline() {
  return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="7" stroke="#e8c766" stroke-width="2"/><path d="M18 18l12 12M25 25l4-4M29 29l4-4" stroke="#e8c766" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function renderNameForm({ mode, code = '', error = '' }) {
  const isJoin = mode === 'join';
  appEl.innerHTML = `
    <div class="landing">
      <div class="landing__badge">${leaderBadgeSVG()}</div>
      <h1 class="landing__title">${isJoin ? 'Gå med' : 'Skapa uppdrag'}</h1>
      <form class="field-card" id="entryForm">
        ${
          isJoin
            ? `<div>
                <div class="field-card__label">Lobbykod</div>
                <input class="name-input" id="codeInput" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="T.ex. AB3XK" value="${escapeHtml(code)}" />
              </div>`
            : ''
        }
        <div>
          <div class="field-card__label">Ditt namn</div>
          <input class="name-input" id="nameInput" maxlength="20" autocomplete="off" placeholder="Skriv ditt namn" value="${escapeHtml(myName)}" />
        </div>
        ${error ? `<div class="error-text">${escapeHtml(error)}</div>` : ''}
        <button class="btn btn--gold" type="submit">${isJoin ? 'Gå med i lobbyn' : 'Skapa lobby'}</button>
        <button class="btn btn--ghost" type="button" id="btnBack">Tillbaka</button>
      </form>
    </div>
  `;
  document.getElementById('btnBack').onclick = () => renderLanding();
  document.getElementById('entryForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('nameInput').value.trim();
    if (!name) return renderNameForm({ mode, code, error: 'Skriv ett namn först.' });
    if (isJoin) {
      const roomCode = document.getElementById('codeInput').value.trim().toUpperCase();
      if (!roomCode) return renderNameForm({ mode, code, error: 'Skriv in lobbykoden du fått.' });
      const res = await net.joinLobby(roomCode, name);
      if (!res.ok) return renderNameForm({ mode, code: roomCode, error: res.message });
      myPlayerId = res.playerId;
      activeRoomCode = res.roomCode;
      pushRoomUrl(res.roomCode);
    } else {
      const res = await net.createLobby(name);
      if (!res.ok) return renderNameForm({ mode, code, error: res.message });
      myPlayerId = res.playerId;
      activeRoomCode = res.roomCode;
      pushRoomUrl(res.roomCode);
    }
  };
}

function renderJoinWithCode(code) {
  appEl.innerHTML = `
    <div class="landing">
      <div class="landing__badge">${leaderBadgeSVG()}</div>
      <h1 class="landing__title">Du är inbjuden</h1>
      <p class="landing__subtitle">Lobbykod <strong>${escapeHtml(code)}</strong> — skriv ditt namn för att slå dig ner vid bordet.</p>
      <form class="field-card" id="entryForm">
        <div>
          <div class="field-card__label">Ditt namn</div>
          <input class="name-input" id="nameInput" maxlength="20" autocomplete="off" placeholder="Skriv ditt namn" autofocus />
        </div>
        ${joinPrefillError ? `<div class="error-text">${escapeHtml(joinPrefillError)}</div>` : ''}
        <button class="btn btn--gold" type="submit">Gå med i lobbyn</button>
        <button class="btn btn--ghost" type="button" id="btnBack">Skriv annan kod</button>
      </form>
    </div>
  `;
  document.getElementById('btnBack').onclick = () => {
    activeRoomCode = null;
    history.pushState({}, '', '/');
    renderLanding();
  };
  document.getElementById('entryForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
      joinPrefillError = 'Skriv ett namn först.';
      return renderJoinWithCode(code);
    }
    const res = await net.joinLobby(code, name);
    if (!res.ok) {
      joinPrefillError = res.message;
      return renderJoinWithCode(code);
    }
    joinPrefillError = null;
    myPlayerId = res.playerId;
    activeRoomCode = res.roomCode;
  };
}

function pushRoomUrl(code) {
  history.pushState({}, '', `/lobby/${code}`);
}

// ---------------------------------------------------------------------------
// Lobby waiting room
// ---------------------------------------------------------------------------
function renderLobbyWaiting(state) {
  gameViewMounted = false; // game table will need a fresh mount once it starts
  const me = state.players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost;
  const shareUrl = `${location.origin}/lobby/${state.roomCode}`;
  const seatSlots = [];
  for (let i = 0; i < state.maxPlayers; i++) {
    const p = state.players[i];
    if (p) {
      seatSlots.push(`
        <div class="seat-slot seat-slot--filled ${p.isHost ? 'seat-slot--host' : ''} ${!p.connected ? 'seat-slot--disconnected' : ''}">
          <div class="avatar">${avatarSVG(p.name, 44)}</div>
          <div class="seat-slot__name">${escapeHtml(p.name)}${p.id === myPlayerId ? ' (du)' : ''}</div>
          ${!p.connected ? '<div class="seat-slot__name" style="color:var(--spy-soft);font-size:0.65rem;">frånkopplad</div>' : ''}
        </div>
      `);
    } else {
      seatSlots.push(`<div class="seat-slot seat-slot--empty">${i < state.minPlayers ? 'Väntar…' : 'Ledig plats'}</div>`);
    }
  }

  const canStart = isHost && state.players.length >= state.minPlayers;

  appEl.innerHTML = `
    <div class="lobby">
      <h1 class="landing__title" style="font-size:1.5rem;">Väntrum</h1>
      <div class="lobby__code-panel">
        <div class="lobby__code-label">Lobbykod — dela med dina vänner</div>
        <div class="lobby__code">${state.roomCode}</div>
        <div class="lobby__share-row">
          <input class="name-input" readonly id="shareUrl" value="${shareUrl}" style="flex:1;font-size:0.8rem;" />
          <button class="btn btn--gold" id="btnCopy">Kopiera länk</button>
        </div>
      </div>
      <div class="lobby__seats">${seatSlots.join('')}</div>
      <div class="lobby__status">
        ${state.players.length}/${state.maxPlayers} spelare anslutna (minst ${state.minPlayers} krävs för att starta)
      </div>
      ${
        isHost
          ? `<button class="btn btn--gold" id="btnStart" style="max-width:360px;width:100%;" ${canStart ? '' : 'disabled'}>
              ${canStart ? 'Starta uppdraget' : `Väntar på fler spelare…`}
            </button>`
          : `<div class="waiting-note">Väntar på att värden ska starta spelet…</div>`
      }
    </div>
  `;

  document.getElementById('btnCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Länk kopierad!');
    } catch {
      document.getElementById('shareUrl').select();
      toast('Markera och kopiera länken manuellt.');
    }
  };

  if (isHost) {
    document.getElementById('btnStart').onclick = async () => {
      const res = await net.startGame();
      if (!res.ok) toast(res.message);
    };
  }
}

// ---------------------------------------------------------------------------
// Game view — persistent table so animations (leader glide, etc.) survive
// across state updates instead of being rebuilt from scratch every tick.
// ---------------------------------------------------------------------------
const gv = {
  seatOrder: [], // player ids in rotated (me-first, clockwise) order
  seatNodes: new Map(),
  leaderBadgeEl: null,
  missionSlotEls: [],
  statusPhaseEl: null,
  statusDetailEl: null,
  rejectionTrackEl: null,
  handDockEl: null,
  roleChipEl: null,
  tableSurfaceEl: null,
  pendingTeam: [],
};

function mountGameView(state) {
  appEl.innerHTML = `
    <div class="game">
      <div class="topbar">
        <div class="topbar__room">UPPDRAG · ${state.roomCode}</div>
        <div class="topbar__role-chip" id="roleChip"></div>
      </div>
      <div class="mission-track" id="missionTrack"></div>
      <div class="status-banner" id="statusBanner">
        <div class="status-banner__phase" id="statusPhase"></div>
        <div class="status-banner__detail" id="statusDetail"></div>
        <div class="rejection-track" id="rejectionTrack"></div>
      </div>
      <div class="table-wrap">
        <div class="table-surface" id="tableSurface"></div>
      </div>
      <div class="hand-dock" id="handDock"></div>
    </div>
  `;
  gv.roleChipEl = document.getElementById('roleChip');
  gv.missionTrackEl = document.getElementById('missionTrack');
  gv.statusPhaseEl = document.getElementById('statusPhase');
  gv.statusDetailEl = document.getElementById('statusDetail');
  gv.rejectionTrackEl = document.getElementById('rejectionTrack');
  gv.handDockEl = document.getElementById('handDock');
  gv.tableSurfaceEl = document.getElementById('tableSurface');
  gv.pendingTeam = [];

  buildMissionTrack(state);
  buildSeats(state);
  applyResponsiveMode();
  window.addEventListener('resize', applyResponsiveMode);

  gameViewMounted = true;
}

function applyResponsiveMode() {
  if (!gv.tableSurfaceEl) return;
  const mobile = window.innerWidth <= 640;
  gv.tableSurfaceEl.classList.toggle('table-surface--mobile-strip', mobile);
}

function buildMissionTrack(state) {
  gv.missionSlotEls = state.missions.map((m, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'mission-slot';
    wrap.innerHTML = `
      <div class="mission-slot__disc" data-idx="${idx}"></div>
      <div class="mission-slot__label">${m.teamSize} spelare${m.requiredFails === 2 ? ' · 2 sabotage' : ''}</div>
    `;
    gv.missionTrackEl.appendChild(wrap);
    return wrap.querySelector('.mission-slot__disc');
  });
}

function buildSeats(state) {
  const players = state.players;
  const n = players.length;
  const myIndex = Math.max(0, players.findIndex((p) => p.id === myPlayerId));
  gv.seatOrder = [];

  const RX = 43;
  const RY = 38;

  for (let rel = 0; rel < n; rel++) {
    const p = players[(myIndex + rel) % n];
    const theta = ((90 - rel * (360 / n)) * Math.PI) / 180;
    const left = 50 + RX * Math.cos(theta);
    const top = 50 + RY * Math.sin(theta);

    const root = document.createElement('div');
    root.className = 'seat';
    root.style.setProperty('--seat-left', `${left}%`);
    root.style.setProperty('--seat-top', `${top}%`);
    root.dataset.playerId = p.id;
    root.innerHTML = `
      <div class="seat__card">
        <div class="seat__card-inner">${cardBackSVG()}</div>
      </div>
      <div class="seat__name"><span class="leader-inline-badge">${leaderBadgeSVG()}</span>${escapeHtml(p.name)}</div>
      ${p.id === myPlayerId ? '<div class="seat__you-tag">Du</div>' : ''}
    `;
    gv.tableSurfaceEl.appendChild(root);
    gv.seatNodes.set(p.id, {
      root,
      card: root.querySelector('.seat__card'),
      inner: root.querySelector('.seat__card-inner'),
    });
  }

  gv.leaderBadgeEl = document.createElement('div');
  gv.leaderBadgeEl.className = 'leader-badge';
  gv.leaderBadgeEl.innerHTML = leaderBadgeSVG();
  gv.tableSurfaceEl.appendChild(gv.leaderBadgeEl);
}

function renderGame(state, previous) {
  if (!gameViewMounted) mountGameView(state);

  updateRoleChip();
  updateMissionTrack(state);
  updateStatusBanner(state);
  updateSeats(state);
  updateLeaderBadge(state);
  renderHandDock(state);

  maybeShowRoleReveal();
  maybeShowVoteReveal(state);
  maybeShowMissionReveal(state);
  maybeShowGameOver(state);
}

function updateRoleChip() {
  if (!myRole) {
    gv.roleChipEl.textContent = '';
    return;
  }
  const isSpy = myRole.role === 'spy';
  gv.roleChipEl.className = `topbar__role-chip ${isSpy ? 'topbar__role-chip--spy' : 'topbar__role-chip--resistance'}`;
  gv.roleChipEl.textContent = isSpy ? 'Du är Spion' : 'Du är Motstånd';
}

function updateMissionTrack(state) {
  state.missions.forEach((m, idx) => {
    const el = gv.missionSlotEls[idx];
    if (!el) return;
    const isCurrent = idx === state.missionNumber - 1 && state.phase !== 'game-over';
    el.className = 'mission-slot__disc';
    if (m.requiredFails === 2) el.classList.add('mission-slot__disc--two-fail');
    if (m.status === 'success') el.classList.add('mission-slot__disc--success');
    else if (m.status === 'fail') el.classList.add('mission-slot__disc--fail');
    else if (isCurrent) el.classList.add('mission-slot__disc--current');
    el.innerHTML = m.status === 'success' ? successIconSVG() : m.status === 'fail' ? failIconSVG() : `${idx + 1}`;
  });
}

const PHASE_COPY = {
  'role-reveal': () => ['Roller delas ut', 'Titta i hemlighet på ditt kort...'],
  'team-select': (s) => {
    const leader = s.players.find((p) => p.id === s.leaderId);
    return [
      `${leader ? leader.name : 'Ledaren'} väljer team`,
      `Försök ${s.proposalNumber}/5 · Behöver ${s.missions[s.missionNumber - 1].teamSize} spelare för uppdrag ${s.missionNumber}`,
    ];
  },
  voting: (s) => [
    'Omröstning pågår',
    `${s.votedPlayerIds.length}/${s.players.length} har lagt sin röst`,
  ],
  mission: (s) => [
    `Uppdrag ${s.missionNumber} pågår`,
    `${s.missionSubmittedIds.length}/${s.currentTeam.length} har spelat sitt kort`,
  ],
  'mission-result': (s) => ['Uppdraget avslöjas...', ''],
  'game-over': (s) => [s.winner === 'resistance' ? 'Motståndet vann' : 'Spionerna vann', ''],
};

function updateStatusBanner(state) {
  const copy = PHASE_COPY[state.phase] ? PHASE_COPY[state.phase](state) : ['', ''];
  gv.statusPhaseEl.textContent = copy[0];
  gv.statusDetailEl.textContent = copy[1];
  gv.rejectionTrackEl.innerHTML = Array.from({ length: 5 })
    .map((_, i) => `<div class="rejection-dot ${i < state.rejectionCount ? 'rejection-dot--used' : ''}"></div>`)
    .join('');
}

function updateSeats(state) {
  const onTeamSet = new Set(state.phase === 'team-select' ? gv.pendingTeam : state.currentTeam);
  const votedSet = new Set(state.votedPlayerIds);
  const submittedSet = new Set(state.missionSubmittedIds);
  const isLeaderMe = state.leaderId === myPlayerId;
  const canSelect = state.phase === 'team-select' && isLeaderMe;

  for (const [playerId, nodes] of gv.seatNodes) {
    const p = state.players.find((pl) => pl.id === playerId);
    nodes.root.classList.toggle('seat--leader', state.leaderId === playerId);
    nodes.root.classList.toggle('seat--disconnected', p ? !p.connected : false);
    nodes.root.classList.toggle('seat--onteam', onTeamSet.has(playerId));
    nodes.root.classList.toggle(
      'seat--voted',
      (state.phase === 'voting' && votedSet.has(playerId)) || (state.phase === 'mission' && submittedSet.has(playerId))
    );
    nodes.root.classList.toggle('seat--selectable', canSelect);

    nodes.card.onclick = canSelect ? () => toggleTeamPick(state, playerId) : null;
  }
}

function toggleTeamPick(state, playerId) {
  const required = state.missions[state.missionNumber - 1].teamSize;
  const idx = gv.pendingTeam.indexOf(playerId);
  if (idx >= 0) {
    gv.pendingTeam.splice(idx, 1);
  } else {
    if (gv.pendingTeam.length >= required) {
      toast(`Teamet får bara bestå av ${required} spelare.`);
      return;
    }
    gv.pendingTeam.push(playerId);
  }
  updateSeats(state);
  renderHandDock(state);
}

function updateLeaderBadge(state) {
  const nodes = gv.seatNodes.get(state.leaderId);
  if (!nodes || !gv.leaderBadgeEl) return;
  gv.leaderBadgeEl.style.setProperty('--seat-left', nodes.root.style.getPropertyValue('--seat-left'));
  const topVal = parseFloat(nodes.root.style.getPropertyValue('--seat-top'));
  gv.leaderBadgeEl.style.setProperty('--seat-top', `${topVal - 13}%`);
}

// ---- Hand dock: contextual controls for the current phase ----------------
function renderHandDock(state) {
  const dock = gv.handDockEl;
  if (!dock) return;
  const isLeaderMe = state.leaderId === myPlayerId;
  const onTeam = state.currentTeam.includes(myPlayerId);

  if (state.phase === 'team-select') {
    if (isLeaderMe) {
      const required = state.missions[state.missionNumber - 1].teamSize;
      dock.innerHTML = `
        <div class="hand-dock__prompt">Peka ut ${required} spelare till uppdraget</div>
        <div class="hand-dock__sub">${gv.pendingTeam.length}/${required} valda</div>
        <button class="btn btn--gold" id="confirmTeam" ${gv.pendingTeam.length === required ? '' : 'disabled'}>Skicka ut teamet</button>
      `;
      document.getElementById('confirmTeam').onclick = async () => {
        const res = await net.proposeTeam(gv.pendingTeam);
        if (!res.ok) toast(res.message);
      };
    } else {
      dock.innerHTML = `<div class="waiting-note">Ledaren väljer ut sitt team...</div>`;
    }
    return;
  }

  if (state.phase === 'voting') {
    if (state.votedPlayerIds.includes(myPlayerId)) {
      dock.innerHTML = `<div class="waiting-note">Din röst är lagd. Väntar på de andra...</div>`;
      return;
    }
    dock.innerHTML = `
      <div class="hand-dock__prompt">Godkänner du det föreslagna teamet?</div>
      <div class="hand-row">
        <button class="choice-card choice-card--approve" id="voteApprove">
          ${approveIconSVG()}
          <span class="choice-card__label">Godkänn</span>
        </button>
        <button class="choice-card choice-card--reject" id="voteReject">
          ${rejectIconSVG()}
          <span class="choice-card__label">Avslå</span>
        </button>
      </div>
    `;
    document.getElementById('voteApprove').onclick = (e) => castVoteOnce(e, true);
    document.getElementById('voteReject').onclick = (e) => castVoteOnce(e, false);
    return;
  }

  if (state.phase === 'mission') {
    if (!onTeam) {
      dock.innerHTML = `<div class="waiting-note">Du är inte med på det här uppdraget. Väntar på teamet...</div>`;
      return;
    }
    if (state.missionSubmittedIds.includes(myPlayerId)) {
      dock.innerHTML = `<div class="waiting-note">Ditt kort är lagt. Väntar på resten av teamet...</div>`;
      return;
    }
    const isSpy = myRole?.role === 'spy';
    dock.innerHTML = `
      <div class="hand-dock__prompt">Lägg ditt uppdragskort</div>
      ${!isSpy ? '<div class="hand-dock__sub">Motståndet kan bara spela Framgång.</div>' : ''}
      <div class="hand-row">
        <button class="choice-card choice-card--success" id="cardSuccess">
          ${successIconSVG()}
          <span class="choice-card__label">Framgång</span>
        </button>
        <button class="choice-card choice-card--fail" id="cardFail" ${isSpy ? '' : 'disabled'}>
          ${failIconSVG()}
          <span class="choice-card__label">Sabotage</span>
        </button>
      </div>
    `;
    document.getElementById('cardSuccess').onclick = (e) => castMissionCardOnce(e, true);
    document.getElementById('cardFail').onclick = (e) => isSpy && castMissionCardOnce(e, false);
    return;
  }

  dock.innerHTML = '';
}

function castVoteOnce(e, approve) {
  e.target.closest('button').disabled = true;
  document.querySelectorAll('#handDock button').forEach((b) => (b.disabled = true));
  net.submitVote(approve).then((res) => {
    if (!res.ok) toast(res.message);
  });
}

function castMissionCardOnce(e, success) {
  document.querySelectorAll('#handDock button').forEach((b) => (b.disabled = true));
  net.submitMissionCard(success).then((res) => {
    if (!res.ok) toast(res.message);
  });
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------
function showOverlay(html, { dismissible = false } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'overlay';
  scrim.innerHTML = `<div class="overlay__panel">${html}</div>`;
  document.body.appendChild(scrim);
  if (dismissible) {
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) scrim.remove();
    });
  }
  return scrim;
}

function maybeShowRoleReveal() {
  if (!latestState || latestState.phase !== 'role-reveal' || !myRole) return;
  const key = `${latestState.missionNumber}-role`;
  if (shownRoleForPhaseKey === key) return;
  shownRoleForPhaseKey = key;

  const isSpy = myRole.role === 'spy';
  const cardFront = isSpy ? spyCardSVG() : resistanceCardSVG();
  const spyList = myRole.spies?.length
    ? `<div class="spy-roster">${myRole.spies.map((s) => `<div class="spy-roster__item">${avatarSVG(s.name, 28)}<span>${escapeHtml(s.name)}</span></div>`).join('')}</div>`
    : '';

  const overlay = showOverlay(`
    <div class="overlay__title">Din hemliga roll</div>
    <div class="flip-card flip-card--flipped" id="roleFlipCard">
      <div class="flip-card__inner">
        <div class="flip-card__face flip-card__face--front">${cardBackSVG()}</div>
        <div class="flip-card__face flip-card__face--back">${cardFront}</div>
      </div>
    </div>
    ${isSpy ? `<div class="center-copy">Dina medspioner:</div>${spyList}` : '<div class="center-copy">Du vet inte vilka spionerna är. Var vaksam.</div>'}
    <div class="center-copy">Spelet fortsätter automatiskt om några sekunder...</div>
  `);
  // Start face-down, then flip after a beat so it reads as "dealt then revealed".
  const flip = overlay.querySelector('#roleFlipCard');
  flip.classList.remove('flip-card--flipped');
  requestAnimationFrame(() => setTimeout(() => flip.classList.add('flip-card--flipped'), 250));

  const closeWhenPhaseChanges = () => {
    if (!latestState || latestState.phase !== 'role-reveal') {
      overlay.remove();
      clearInterval(watcher);
    }
  };
  const watcher = setInterval(closeWhenPhaseChanges, 300);
}

function voteRevealKey(reveal) {
  return `${reveal.missionNumber}-${reveal.proposalNumber}`;
}

function maybeShowVoteReveal(state) {
  const reveal = state.lastVoteReveal;
  if (!reveal) return;
  const key = voteRevealKey(reveal);
  if (shownVoteRevealKey === key) return;
  shownVoteRevealKey = key;

  const chips = state.players
    .map((p, i) => {
      const approved = reveal.votes[p.id];
      return `
        <div class="vote-chip">
          <div class="vote-chip__result vote-chip__result--${approved ? 'approve' : 'reject'}" style="--delay:${i * 0.08}s">
            ${approved ? '&#10003;' : '&#10007;'}
          </div>
          <div class="vote-chip__name">${escapeHtml(p.name)}</div>
        </div>`;
    })
    .join('');

  const overlay = showOverlay(`
    <div class="overlay__title">Omröstningen avslöjas</div>
    <div class="result-verdict result-verdict--${reveal.approved ? 'approved' : 'rejected'}">
      ${reveal.approved ? 'TEAMET GODKÄNT' : 'TEAMET AVSLÅGET'}
    </div>
    <div class="vote-reveal-row">${chips}</div>
    ${!reveal.approved ? '<div class="center-copy">Ledarskapet går vidare till nästa spelare...</div>' : '<div class="center-copy">Uppdraget inleds...</div>'}
  `);
  setTimeout(() => overlay.remove(), 4200);
}

function missionRevealKey(reveal) {
  return `${reveal.missionNumber}-${reveal.failCount}`;
}

function maybeShowMissionReveal(state) {
  const reveal = state.lastMissionReveal;
  if (!reveal || state.phase !== 'mission-result') return;
  const key = missionRevealKey(reveal);
  if (shownMissionRevealKey === key) return;
  shownMissionRevealKey = key;

  const cards = Array.from({ length: reveal.teamSize }).map((_, i) => {
    const isFail = i < reveal.failCount;
    return `<div class="mission-reveal-card ${isFail ? 'mission-reveal-card--fail' : 'mission-reveal-card--success'}" style="--delay:${i * 0.12}s">${isFail ? failIconSVG() : successIconSVG()}</div>`;
  });

  const overlay = showOverlay(`
    <div class="overlay__title">Uppdrag ${reveal.missionNumber} avslöjas</div>
    <div class="mission-reveal-cards">${cards.join('')}</div>
    <div class="result-verdict result-verdict--${reveal.result}">
      ${reveal.result === 'success' ? 'UPPDRAGET LYCKADES' : 'UPPDRAGET MISSLYCKADES'}
    </div>
    <div class="center-copy">${reveal.failCount} sabotagekort spelades (av ${reveal.teamSize})</div>
  `);
  setTimeout(() => overlay.remove(), 4800);
}

function maybeShowGameOver(state) {
  if (state.phase !== 'game-over' || !state.gameOverRoles) return;
  if (gameOverShown) return;
  gameOverShown = true;

  const roster = state.gameOverRoles
    .map(
      (p) => `
      <div class="gameover-roster__item gameover-roster__item--${p.role}">
        ${avatarSVG(p.name, 40)}
        <span>${escapeHtml(p.name)}</span>
        <strong>${p.role === 'spy' ? 'Spion' : 'Motstånd'}</strong>
      </div>`
    )
    .join('');

  const resistanceWon = state.winner === 'resistance';
  const reasonText =
    state.winReason === 'rejections'
      ? 'Fem teamförslag i rad avslogs.'
      : resistanceWon
      ? 'Motståndet klarade tre uppdrag.'
      : 'Spionerna saboterade tre uppdrag.';

  showOverlay(
    `
    <div class="winner-banner winner-banner--${resistanceWon ? 'resistance' : 'spy'}">
      ${resistanceWon ? 'MOTSTÅNDET VINNER' : 'SPIONERNA VINNER'}
    </div>
    <div class="center-copy">${reasonText}</div>
    <div class="gameover-roster">${roster}</div>
    <button class="btn btn--gold" id="btnNewGame">Till startsidan</button>
  `,
    { dismissible: false }
  );
  document.getElementById('btnNewGame').onclick = () => {
    window.location.href = '/';
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
window.addEventListener('popstate', () => {
  activeRoomCode = getCodeFromPath();
  if (!latestState) renderPreGame();
});

renderPreGame();
