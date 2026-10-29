/**
 * MovementRangeNormalizer.ts
 * Shared utility for normalizing range-of-motion and movement progress
 * across diverse exercise kinematics (flexion, extension, elevation).
 */

export interface NormalizerOptions {
  clamp?: boolean;
  minRangeDegrees?: number;
}

/**
 * Normalizes a current angle or geometric measurement between a calibrated
 * start position and a target position.
 * 
 * Supports:
 * - Decreasing angle trajectories (e.g. Bicep Curl elbow flexion, Squat knee flexion)
 * - Increasing angle trajectories (e.g. Shoulder Press overhead elevation / lockout)
 * 
 * Safety:
 * - Rejects non-numbers, NaN, Infinity
 * - Rejects zero-width or sub-threshold calibration ranges (prevents divide-by-zero)
 * - Clamps percentage to [0, 100] when clamp is true
 */
export function calculateNormalizedROM(
  current: number | null | undefined,
  start: number | null | undefined,
  target: number | null | undefined,
  options: NormalizerOptions = { clamp: true, minRangeDegrees: 5 }
): number | null {
  if (
    current == null ||
    start == null ||
    target == null ||
    typeof current !== 'number' ||
    typeof start !== 'number' ||
    typeof target !== 'number' ||
    Number.isNaN(current) ||
    Number.isNaN(start) ||
    Number.isNaN(target) ||
    !Number.isFinite(current) ||
    !Number.isFinite(start) ||
    !Number.isFinite(target)
  ) {
    return null;
  }

  const travelRange = Math.abs(start - target);
  const minRange = options.minRangeDegrees ?? 5;
  if (travelRange < minRange) {
    return null;
  }

  let progress: number;
  if (start > target) {
    // Decreasing movement (e.g. flexion 160° -> 50°)
    progress = ((start - current) / travelRange) * 100;
  } else {
    // Increasing movement (e.g. extension/elevation 80° -> 160°)
    progress = ((current - start) / travelRange) * 100;
  }

  if (Number.isNaN(progress) || !Number.isFinite(progress)) {
    return null;
  }

  if (options.clamp !== false) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  return Math.round(progress);
}

/**
 * Calculates raw angular displacement in degrees between two extreme positions.
 */
export function calculateAngularROM(
  angleA: number | null | undefined,
  angleB: number | null | undefined
): number | null {
  if (
    angleA == null ||
    angleB == null ||
    typeof angleA !== 'number' ||
    typeof angleB !== 'number' ||
    Number.isNaN(angleA) ||
    Number.isNaN(angleB) ||
    !Number.isFinite(angleA) ||
    !Number.isFinite(angleB)
  ) {
    return null;
  }

  return Math.round(Math.abs(angleA - angleB));
}
