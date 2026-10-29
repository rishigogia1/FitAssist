import { describe, it, expect } from 'vitest';
import { ExerciseRegistry, UnsupportedExerciseError } from './ExerciseRegistry';
import { SquatAnalyzer } from './SquatAnalyzer';
import { PushUpAnalyzer } from './PushUpAnalyzer';
import { LungeAnalyzer } from './LungeAnalyzer';
import { BicepCurlAnalyzer } from './BicepCurlAnalyzer';
import { ShoulderPressAnalyzer } from './ShoulderPressAnalyzer';
import { UnsupportedExerciseAnalyzer } from './UnsupportedExerciseAnalyzer';
import { ExerciseType, PoseFrame } from '../types';

function createMockPoseFrame(kneeAngle = 175): PoseFrame {
  // Generate dummy landmarks
  const landmarks = Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95
  }));

  // Right hip (24), knee (26), ankle (28)
  landmarks[24] = { x: 0.5, y: 0.4, z: 0.0, visibility: 0.95 };
  landmarks[26] = { x: 0.5, y: 0.6, z: 0.0, visibility: 0.95 };
  landmarks[28] = { x: 0.5, y: 0.8, z: 0.0, visibility: 0.95 };

  // Left hip (23), knee (25), ankle (27)
  landmarks[23] = { x: 0.5, y: 0.4, z: 0.0, visibility: 0.95 };
  landmarks[25] = { x: 0.5, y: 0.6, z: 0.0, visibility: 0.95 };
  landmarks[27] = { x: 0.5, y: 0.8, z: 0.0, visibility: 0.95 };

  return {
    landmarks,
    timestamp: Date.now(),
    width: 640,
    height: 480
  };
}

describe('ExerciseRegistry Architecture & Standard Contract', () => {
  const CANONICAL_EXERCISES: ExerciseType[] = [
    'SQUAT',
    'PUSH_UP',
    'LUNGE',
    'BICEP_CURL',
    'SHOULDER_PRESS',
    'PLANK'
  ];

  it('recognizes all six canonical exercise identifiers', () => {
    const allDefs = ExerciseRegistry.getAllDefinitions();
    expect(allDefs).toHaveLength(6);
    const ids = allDefs.map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(CANONICAL_EXERCISES));
  });

  it('maintains consistent exercise capability metadata', () => {
    for (const id of CANONICAL_EXERCISES) {
      const def = ExerciseRegistry.getDefinition(id);
      expect(def.id).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.supportedMetrics.length).toBeGreaterThan(0);
      expect(def.requiredLandmarkGroups.length).toBeGreaterThan(0);
      expect(def.cameraViewRequirement).toMatch(/^(SAGITTAL|FRONTAL|ANY)$/);
      expect(def.cameraViewDescription).toBeTruthy();

      if (id === 'SQUAT' || id === 'PUSH_UP' || id === 'LUNGE' || id === 'BICEP_CURL' || id === 'SHOULDER_PRESS') {
        expect(def.isImplemented).toBe(true);
      } else {
        expect(def.isImplemented).toBe(false);
      }

      if (id === 'PLANK') {
        expect(def.isRepetitionBased).toBe(false);
      } else {
        expect(def.isRepetitionBased).toBe(true);
      }
    }
  });

  it('resolves SQUAT to the working SquatAnalyzer', () => {
    const analyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    expect(analyzer).toBeInstanceOf(SquatAnalyzer);
    expect(analyzer.exerciseType).toBe('SQUAT');
    expect(analyzer.isRepetitionBased).toBe(true);
    expect(ExerciseRegistry.isImplemented('SQUAT')).toBe(true);
  });

  it('resolves PUSH_UP to the working PushUpAnalyzer', () => {
    const analyzer = ExerciseRegistry.getAnalyzer('PUSH_UP');
    expect(analyzer).toBeInstanceOf(PushUpAnalyzer);
    expect(analyzer.exerciseType).toBe('PUSH_UP');
    expect(analyzer.isRepetitionBased).toBe(true);
    expect(ExerciseRegistry.isImplemented('PUSH_UP')).toBe(true);
  });

  it('resolves LUNGE to the working LungeAnalyzer', () => {
    const analyzer = ExerciseRegistry.getAnalyzer('LUNGE');
    expect(analyzer).toBeInstanceOf(LungeAnalyzer);
    expect(analyzer.exerciseType).toBe('LUNGE');
    expect(analyzer.isRepetitionBased).toBe(true);
    expect(ExerciseRegistry.isImplemented('LUNGE')).toBe(true);
  });

  it('resolves BICEP_CURL to the working BicepCurlAnalyzer', () => {
    const analyzer = ExerciseRegistry.getAnalyzer('BICEP_CURL');
    expect(analyzer).toBeInstanceOf(BicepCurlAnalyzer);
    expect(analyzer.exerciseType).toBe('BICEP_CURL');
    expect(analyzer.isRepetitionBased).toBe(true);
    expect(ExerciseRegistry.isImplemented('BICEP_CURL')).toBe(true);
  });

  it('resolves SHOULDER_PRESS to the working ShoulderPressAnalyzer', () => {
    const analyzer = ExerciseRegistry.getAnalyzer('SHOULDER_PRESS');
    expect(analyzer).toBeInstanceOf(ShoulderPressAnalyzer);
    expect(analyzer.exerciseType).toBe('SHOULDER_PRESS');
    expect(analyzer.isRepetitionBased).toBe(true);
    expect(ExerciseRegistry.isImplemented('SHOULDER_PRESS')).toBe(true);
  });

  it('resolves unsupported PLANK to UnsupportedExerciseAnalyzer without falling back to Squat, PushUp or Lunge', () => {
    const unsupportedList: ExerciseType[] = ['PLANK'];

    for (const ex of unsupportedList) {
      const analyzer = ExerciseRegistry.getAnalyzer(ex);
      expect(analyzer).toBeInstanceOf(UnsupportedExerciseAnalyzer);
      expect(analyzer).not.toBeInstanceOf(SquatAnalyzer);
      expect(analyzer).not.toBeInstanceOf(PushUpAnalyzer);
      expect(analyzer).not.toBeInstanceOf(LungeAnalyzer);
      expect(analyzer.exerciseType).toBe(ex);
      expect(ExerciseRegistry.isImplemented(ex)).toBe(false);

      // Verify that processing a frame yields the unsupported notice and no fabricated metrics
      const frame = createMockPoseFrame();
      analyzer.analyzePoseFrame(frame);
      const assessment = analyzer.getFormAssessment?.();
      expect(assessment?.activeFeedback).toContain('coming soon');
    }
  });

  it('handles PLANK as duration-based without fabricating repetition counts', () => {
    const plankAnalyzer = ExerciseRegistry.getAnalyzer('PLANK');
    expect(plankAnalyzer.isRepetitionBased).toBe(false);
    expect(plankAnalyzer.exerciseType).toBe('PLANK');

    const frame = createMockPoseFrame();
    plankAnalyzer.analyzePoseFrame(frame);
    const metrics = plankAnalyzer.getMetrics();

    // Critical requirement: Plank must NOT fabricate reps
    expect(metrics.reps).toBeNull();
    expect(metrics.holdDurationMs).toBeDefined();
    expect(metrics.exercise).toBe('PLANK');
  });

  it('preserves working functionality of SquatAnalyzer', async () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    await squatAnalyzer.initialize();

    const frame = createMockPoseFrame();
    squatAnalyzer.analyzePoseFrame(frame);

    const metrics = squatAnalyzer.getMetrics();
    expect(metrics.exercise).toBe('SQUAT');
    expect(metrics.reps).toBe(0);
    expect(metrics.kneeAngle).toBeDefined();
    expect(metrics.phase).toBeDefined();

    const assessment = squatAnalyzer.getFormAssessment?.();
    expect(assessment).toBeDefined();
    expect(assessment?.overallScore).toBe(100);
  });

  it('ensures resetting an analyzer clears exercise-specific state', () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    const frame = createMockPoseFrame();
    squatAnalyzer.analyzePoseFrame(frame);

    squatAnalyzer.reset();
    const metrics = squatAnalyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('IDLE');
  });

  it('ensures exercise switching does not retain stale analyzer state', () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    squatAnalyzer.analyzePoseFrame(createMockPoseFrame());
    expect(squatAnalyzer.getMetrics().exercise).toBe('SQUAT');

    const plankAnalyzer = ExerciseRegistry.getAnalyzer('PLANK');
    expect(plankAnalyzer.getMetrics().exercise).toBe('PLANK');
    expect(plankAnalyzer.getMetrics().reps).toBeNull();
    expect(plankAnalyzer.getMetrics().kneeAngle).toBeNull();
  });

  it('handles invalid or unknown exercise identifiers safely', () => {
    // Non-strict mode returns safe UnsupportedExerciseAnalyzer
    const unknownAnalyzer = ExerciseRegistry.getAnalyzer('UNKNOWN' as ExerciseType, false);
    expect(unknownAnalyzer).toBeInstanceOf(UnsupportedExerciseAnalyzer);
    expect(unknownAnalyzer.exerciseType).toBe('UNKNOWN');

    // Strict mode throws UnsupportedExerciseError
    expect(() => {
      ExerciseRegistry.getAnalyzer('NON_EXISTENT' as any, true);
    }).toThrow(UnsupportedExerciseError);
  });
});
