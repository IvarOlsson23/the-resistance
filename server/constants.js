// Core rules tables for The Resistance (base game, 5-10 players).
// Source: official rulebook mission/spy counts.

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

// Number of spies for a given player count.
export const SPY_COUNTS = {
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
};

// Team (mission) sizes for missions 1-5, indexed by player count.
export const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

// Mission index (0-based) that requires two fail cards to fail, only at 7+ players.
const TWO_FAIL_MISSION_INDEX = 3; // Mission 4

export function requiredFails(playerCount, missionIndex) {
  if (playerCount >= 7 && missionIndex === TWO_FAIL_MISSION_INDEX) return 2;
  return 1;
}

export function twoFailMissionIndex(playerCount) {
  return playerCount >= 7 ? TWO_FAIL_MISSION_INDEX : null;
}

export const MAX_CONSECUTIVE_REJECTIONS = 5;
export const MISSIONS_TO_WIN = 3;

// Absolute floor for "Start anyway" — bypasses MIN_PLAYERS for local
// prototyping only. Below 5 players there's no official rules table, so
// spyCountFor/teamSizesFor below improvise something playable, not balanced.
export const MIN_PLAYERS_TESTING = 2;

export function spyCountFor(playerCount) {
  return SPY_COUNTS[playerCount] ?? Math.max(1, Math.min(2, playerCount - 1));
}

export function teamSizesFor(playerCount) {
  const base = TEAM_SIZES[playerCount] || TEAM_SIZES[5];
  return base.map((size) => Math.max(1, Math.min(playerCount, size)));
}
