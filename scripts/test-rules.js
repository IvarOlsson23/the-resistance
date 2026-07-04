// White-box unit tests for the rules engine edge cases that the socket-level
// simulation doesn't pin down deterministically (mission 4's two-fail rule,
// the five-rejections auto-loss, resistance winning outright).
import { Game } from '../server/game.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('ok -', msg);
}

function freshGame(playerCount, spyIds) {
  const game = new Game('TEST');
  for (let i = 0; i < playerCount; i++) game.addPlayer(`P${i}`, `sock${i}`);
  game.startGame();
  // Force a known role assignment regardless of the random shuffle.
  game.players.forEach((p, i) => game.roles.set(p.id, spyIds.includes(i) ? 'spy' : 'resistance'));
  game.beginTeamSelect();
  return game;
}

function playMissionRound(game, teamIdxs, cardsByIdx) {
  const leaderId = game.leader.id;
  const teamIds = teamIdxs.map((i) => game.players[i].id);
  game.proposeTeam(leaderId, teamIds);
  for (const p of game.players) game.castVote(p.id, true);
  game.resolveVote();
  for (const idx of teamIdxs) {
    game.submitMissionCard(game.players[idx].id, cardsByIdx[idx]);
  }
  return game.resolveMission();
}

// --- Two-fail rule at 7+ players, mission 4 (index 3) -----------------------
{
  const game = freshGame(7, [0, 1, 2]); // spies at index 0,1,2
  // Missions 1-2 succeed, mission 3 fails, to reach mission 4 undecided (2-1).
  playMissionRound(game, [3, 4], { 3: true, 4: true }); // mission1, no spies on team -> success
  game.advanceAfterMission();
  playMissionRound(game, [3, 4, 5], { 3: true, 4: true, 5: true }); // mission2 success
  game.advanceAfterMission();
  playMissionRound(game, [0, 4, 5], { 0: false, 4: true, 5: true }); // mission3 fail (1 spy fails)
  game.advanceAfterMission();
  assert(game.missionNumber === 4, 'reached mission 4 with score 2-1');
  assert(game.missions[3].requiredFails === 2, 'mission 4 requires 2 fails at 7 players');

  // Team of 4 including both spy 0 and spy 1; only ONE plays fail -> should still succeed.
  // (Missions 1,2 already succeeded and 3 failed, so this 3rd success also ends the game.)
  const resultOneFail = playMissionRound(game, [0, 1, 3, 4], { 0: false, 1: true, 3: true, 4: true });
  assert(resultOneFail.mission.status === 'success', 'mission 4 with only 1 fail card should still succeed (needs 2)');
  assert(game.winner === 'resistance', 'three successful missions (1,2,4) should end the game for resistance');
}

// --- Two-fail rule: exactly 2 fails should fail the mission -----------------
{
  const game = freshGame(7, [0, 1, 2]);
  playMissionRound(game, [3, 4], { 3: true, 4: true }); // success
  game.advanceAfterMission();
  playMissionRound(game, [0, 4, 5], { 0: false, 4: true, 5: true }); // fail
  game.advanceAfterMission();
  playMissionRound(game, [3, 4, 5], { 3: true, 4: true, 5: true }); // success -> score 2-1 entering mission 4
  game.advanceAfterMission();
  assert(game.missionNumber === 4, 'reached mission 4 at 2-1');

  const result = playMissionRound(game, [0, 1, 3, 4], { 0: false, 1: false, 3: true, 4: true });
  assert(result.mission.status === 'fail', 'mission 4 with 2 fail cards should fail');
  assert(result.mission.failCount === 2, 'failCount should be recorded as 2');
}

// --- 5 players: mission 4 only needs 1 fail (no two-fail rule below 7) -----
{
  const game = freshGame(5, [0, 1]);
  assert(game.missions[3].requiredFails === 1, 'mission 4 needs only 1 fail below 7 players');
}

// --- Five consecutive rejections hand spies an automatic win ---------------
{
  const game = freshGame(6, [0, 1]);
  for (let attempt = 0; attempt < 5; attempt++) {
    const leaderId = game.leader.id;
    const required = game.missions[0].teamSize;
    const teamIds = game.players.slice(0, required).map((p) => p.id);
    game.proposeTeam(leaderId, teamIds);
    for (const p of game.players) game.castVote(p.id, false); // everyone rejects
    game.resolveVote();
  }
  assert(game.phase === 'game-over', 'phase should be game-over after 5 rejections');
  assert(game.winner === 'spies', 'spies should win after 5 consecutive rejections');
  assert(game.winReason === 'rejections', 'win reason should be rejections');
}

// --- A rejected vote does not count toward the rejection streak once reset -
{
  const game = freshGame(6, [0, 1]);
  for (let attempt = 0; attempt < 4; attempt++) {
    const leaderId = game.leader.id;
    const required = game.missions[0].teamSize;
    const teamIds = game.players.slice(0, required).map((p) => p.id);
    game.proposeTeam(leaderId, teamIds);
    for (const p of game.players) game.castVote(p.id, false);
    game.resolveVote();
  }
  assert(game.rejectionCount === 4, 'four rejections recorded');
  assert(game.phase === 'team-select', 'still picking a team, not game-over yet');
  // Fifth proposal gets approved -> streak resets, mission proceeds.
  const leaderId = game.leader.id;
  const required = game.missions[0].teamSize;
  const teamIds = game.players.slice(0, required).map((p) => p.id);
  game.proposeTeam(leaderId, teamIds);
  for (const p of game.players) game.castVote(p.id, true);
  game.resolveVote();
  assert(game.rejectionCount === 0, 'rejection streak resets after an approval');
  assert(game.phase === 'mission', 'moved on to mission play');
}

// --- Resistance wins outright at 3 successful missions ----------------------
{
  const game = freshGame(5, [0, 1]);
  playMissionRound(game, [2, 3], { 2: true, 3: true });
  game.advanceAfterMission();
  playMissionRound(game, [2, 3, 4], { 2: true, 3: true, 4: true });
  game.advanceAfterMission();
  const r = playMissionRound(game, [2, 3], { 2: true, 3: true });
  assert(r.mission.status === 'success', 'third mission succeeds');
  assert(game.winner === 'resistance', 'resistance should win at 3 successes');
  assert(game.winReason === 'missions', 'win reason should be missions');
}

// --- Resistance members can never submit a fail card, even if asked to -----
{
  const game = freshGame(5, [0, 1]);
  const leaderId = game.leader.id;
  const teamIds = [game.players[2].id, game.players[3].id];
  game.proposeTeam(leaderId, teamIds);
  for (const p of game.players) game.castVote(p.id, true);
  game.resolveVote();
  game.submitMissionCard(game.players[2].id, false); // resistance tries to sabotage
  const result = game.resolveMission();
  assert(result.mission.failCount === 0, 'resistance-only team cannot produce a fail card');
}

// --- "Start anyway" testing shortcut: normal start still enforces 5 --------
{
  const game = new Game('TEST');
  for (let i = 0; i < 3; i++) game.addPlayer(`P${i}`, `sock${i}`);
  assert(!game.canStart(false), 'cannot normal-start with only 3 players');
  assert(game.canStart(true), 'can force-start with only 3 players');
  let threw = false;
  try {
    game.startGame(false);
  } catch {
    threw = true;
  }
  assert(threw, 'startGame(false) should still reject below 5 players');
  assert(game.phase === 'lobby', 'game should remain in lobby after rejected start');
}

// --- Force-start improvises playable spy/team counts below 5 players -------
{
  const game = new Game('TEST');
  for (let i = 0; i < 3; i++) game.addPlayer(`P${i}`, `sock${i}`);
  game.startGame(true);
  assert(game.phase === 'role-reveal', 'force-started game should proceed to role-reveal');
  const spies = game.players.filter((p) => game.roles.get(p.id) === 'spy');
  assert(spies.length >= 1 && spies.length < 3, 'a 3-player force-start should have at least 1 spy and 1 resistance');
  assert(game.missions.length === 5, 'still five missions even in a testing game');
  assert(
    game.missions.every((m) => m.teamSize >= 1 && m.teamSize <= 3),
    'team sizes should be clamped to the available player count'
  );
}

{
  const game = new Game('TEST');
  game.addPlayer('Solo', 'sock0');
  assert(!game.canStart(true), 'force-start still refuses a single player');
}

console.log('\nALL RULE UNIT TESTS PASSED');
