/**
 * Cycling Fantasy Scoring Engine
 *
 * Core mechanic: points = base_points × sqrt(decimal_odds)
 * This rewards picking underdogs (high odds) much more than favorites (low odds).
 * Pogačar at 1.25 → multiplier 1.12. A 100/1 rider → multiplier 10.
 *
 * Captain doubles ALL points (including penalties).
 */

export interface PointsBreakdown {
  stage: number;      // points from finishing position
  jerseys: number;    // points from wearing jerseys
  kom: number;        // points from mountain competition
  sprint: number;     // points from sprint competition
  combative: number;  // combative rider award
  penalty: number;    // negative points (DNF / bottom 20%)
}

// Base points by finishing position
const POSITION_POINTS: Record<number, number> = {
  1: 100,
  2: 70,
  3: 50,
  4: 35,
  5: 28,
  6: 23,
  7: 19,
  8: 16,
  9: 14,
  10: 12,
};

function getPositionPoints(position: number, totalFinishers: number): number {
  if (position <= 10) return POSITION_POINTS[position] ?? 10;
  // 11th–20th
  if (position <= 20) return 8;
  // top 80%
  const cutoff = Math.ceil(totalFinishers * 0.8);
  if (position <= cutoff) return 4;
  // bottom 20% → penalty (handled separately)
  return 0;
}

// Jersey points (for wearing the jersey at end of stage)
const JERSEY_POINTS = {
  yellow: 30,
  green: 20,
  polkadot: 20,
  white: 15,
} as const;

// KOM and sprint point multipliers
const KOM_POINT_VALUE = 3;    // each mountain point = 3 fantasy points
const SPRINT_POINT_VALUE = 2; // each sprint point = 2 fantasy points
const COMBATIVE_POINTS = 25;

// Penalties
const DNF_PENALTY = -30;
const BOTTOM_20_PENALTY = -10;

export interface RiderStageInput {
  riderId: number;
  oddsDecimal: number;
  position: number | null;
  dnf: boolean;
  totalFinishers: number;
  komPointsEarned: number;
  sprintPointsEarned: number;
  hadCombativeAward: boolean;
  wearsYellow: boolean;
  wearsGreen: boolean;
  wearsPolkadot: boolean;
  wearsWhite: boolean;
}

export interface ScoredRider {
  riderId: number;
  oddsDecimal: number;
  oddsMultiplier: number;
  basePoints: number;
  totalPoints: number;
  breakdown: PointsBreakdown;
}

export function scoreRider(input: RiderStageInput): ScoredRider {
  const odds = Math.max(1, input.oddsDecimal); // floor at 1
  const multiplier = Math.sqrt(odds);

  const breakdown: PointsBreakdown = {
    stage: 0,
    jerseys: 0,
    kom: 0,
    sprint: 0,
    combative: 0,
    penalty: 0,
  };

  if (input.dnf) {
    breakdown.penalty = DNF_PENALTY;
  } else if (input.position !== null) {
    const cutoff = Math.ceil(input.totalFinishers * 0.8);
    if (input.position > cutoff) {
      breakdown.penalty = BOTTOM_20_PENALTY;
    } else {
      breakdown.stage = getPositionPoints(input.position, input.totalFinishers);
    }
  }

  // Jersey points (flat, no odds multiplier — these are certain)
  if (input.wearsYellow) breakdown.jerseys += JERSEY_POINTS.yellow;
  if (input.wearsGreen) breakdown.jerseys += JERSEY_POINTS.green;
  if (input.wearsPolkadot) breakdown.jerseys += JERSEY_POINTS.polkadot;
  if (input.wearsWhite) breakdown.jerseys += JERSEY_POINTS.white;

  // KOM and sprint points (scale with odds)
  breakdown.kom = input.komPointsEarned * KOM_POINT_VALUE;
  breakdown.sprint = input.sprintPointsEarned * SPRINT_POINT_VALUE;

  // Combative award
  if (input.hadCombativeAward) breakdown.combative = COMBATIVE_POINTS;

  // Base points = stage + kom + sprint + combative (scaled by odds)
  // Jerseys and penalties are flat (not scaled)
  const oddsScaledBase =
    (breakdown.stage + breakdown.kom + breakdown.sprint + breakdown.combative) * multiplier +
    breakdown.jerseys +
    breakdown.penalty;

  // Round to 2dp
  const basePoints = Math.round(oddsScaledBase * 100) / 100;

  return {
    riderId: input.riderId,
    oddsDecimal: odds,
    oddsMultiplier: Math.round(multiplier * 10000) / 10000,
    basePoints,
    totalPoints: basePoints, // captain applies 2× at user level
    breakdown,
  };
}

export function applyCaptainBonus(points: number): number {
  return Math.round(points * 2 * 100) / 100;
}
