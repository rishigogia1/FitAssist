import { describe, it, expect } from 'vitest';
import { calculateNormalizedROM, calculateAngularROM } from './MovementRangeNormalizer';

describe('MovementRangeNormalizer', () => {
  describe('calculateNormalizedROM', () => {
    it('normalizes decreasing angle movement correctly (e.g. bicep curl)', () => {
      const start = 160;
      const target = 50;

      // At start
      expect(calculateNormalizedROM(160, start, target)).toBe(0);

      // Halfway
      expect(calculateNormalizedROM(105, start, target)).toBe(50);

      // At target peak
      expect(calculateNormalizedROM(50, start, target)).toBe(100);

      // Overshoot clamped to 100
      expect(calculateNormalizedROM(35, start, target)).toBe(100);

      // Past start clamped to 0
      expect(calculateNormalizedROM(175, start, target)).toBe(0);
    });

    it('normalizes increasing angle movement correctly (e.g. shoulder press)', () => {
      const start = 80;
      const target = 160;

      // At start rack
      expect(calculateNormalizedROM(80, start, target)).toBe(0);

      // Halfway press
      expect(calculateNormalizedROM(120, start, target)).toBe(50);

      // At overhead lockout
      expect(calculateNormalizedROM(160, start, target)).toBe(100);

      // Overshoot clamped to 100
      expect(calculateNormalizedROM(175, start, target)).toBe(100);

      // Lower than start clamped to 0
      expect(calculateNormalizedROM(65, start, target)).toBe(0);
    });

    it('handles unclamped normalization when requested', () => {
      const start = 160;
      const target = 60; // 100° range
      expect(calculateNormalizedROM(40, start, target, { clamp: false })).toBe(120);
    });

    it('rejects zero-width or near-zero calibration ranges without dividing by zero', () => {
      expect(calculateNormalizedROM(100, 100, 100)).toBeNull();
      expect(calculateNormalizedROM(100, 100, 102, { minRangeDegrees: 5 })).toBeNull();
    });

    it('rejects null, undefined, NaN, and Infinity safely', () => {
      expect(calculateNormalizedROM(null, 160, 50)).toBeNull();
      expect(calculateNormalizedROM(undefined, 160, 50)).toBeNull();
      expect(calculateNormalizedROM(NaN, 160, 50)).toBeNull();
      expect(calculateNormalizedROM(Infinity, 160, 50)).toBeNull();
      expect(calculateNormalizedROM(100, NaN, 50)).toBeNull();
      expect(calculateNormalizedROM(100, 160, Infinity)).toBeNull();
    });
  });

  describe('calculateAngularROM', () => {
    it('computes positive absolute difference between angles', () => {
      expect(calculateAngularROM(160, 50)).toBe(110);
      expect(calculateAngularROM(80, 165)).toBe(85);
      expect(calculateAngularROM(90, 90)).toBe(0);
    });

    it('rejects invalid numerical inputs', () => {
      expect(calculateAngularROM(null, 100)).toBeNull();
      expect(calculateAngularROM(100, NaN)).toBeNull();
      expect(calculateAngularROM(Infinity, 100)).toBeNull();
    });
  });
});
