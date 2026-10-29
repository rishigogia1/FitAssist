import { describe, it, expect, beforeEach } from 'vitest';
import { ShoulderPressFormAnalyzer, SHOULDER_PRESS_FORM_CONFIG } from './ShoulderPressFormAnalyzer';
import { PoseFrame, ExerciseMetrics } from '../types';

function createMockFrame(confidence = 0.9, timestamp = 1000): PoseFrame {
  return {
    landmarks: Array(33).fill({ id: 0, x: 0.5, y: 0.5, z: 0, visibility: confidence }),
    confidence,
    timestamp,
    inferenceLatencyMs: 5
  };
}

function createMockMetrics(overrides: Partial<ExerciseMetrics> = {}): ExerciseMetrics {
  return {
    exercise: 'SHOULDER_PRESS',
    phase: 'STANDING',
    reps: 0,
    currentRep: 0,
    holdDurationMs: null,
    holdDurationSec: null,
    kneeAngle: null,
    leftKneeAngle: null,
    rightKneeAngle: null,
    hipAngle: 180,
    elbowAngle: 85,
    rangeOfMotion: null,
    romPercent: null,
    depth: null,
    repDurationMs: null,
    confidence: 0.9,
    timestamp: 1000,
    ...overrides
  };
}

describe('ShoulderPressFormAnalyzer', () => {
  let formAnalyzer: ShoulderPressFormAnalyzer;

  beforeEach(() => {
    formAnalyzer = new ShoulderPressFormAnalyzer();
  });

  it('detects INCOMPLETE_OVERHEAD_EXTENSION when rep fails to reach >= 150° lockout', () => {
    // Start concentric press
    formAnalyzer.analyze(
      createMockFrame(0.9, 1000),
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 })
    );

    // Reaches only 140° (below 150° overhead extension threshold)
    formAnalyzer.analyze(
      createMockFrame(0.9, 1500),
      createMockMetrics({ phase: 'BOTTOM', elbowAngle: 140 })
    );

    // Eccentric lowering
    formAnalyzer.analyze(
      createMockFrame(0.9, 2000),
      createMockMetrics({ phase: 'ECCENTRIC', elbowAngle: 115 })
    );

    // Return to rack
    formAnalyzer.analyze(
      createMockFrame(0.9, 2500),
      createMockMetrics({ phase: 'STANDING', reps: 1, elbowAngle: 90 })
    );

    const reps = formAnalyzer.getRepAssessments();
    expect(reps).toHaveLength(1);
    expect(reps[0].issues).toContain('INCOMPLETE_OVERHEAD_EXTENSION');
    expect(reps[0].formScore).toBeLessThan(100);
  });

  it('detects INCOMPLETE_LOWERING when user does not lower weights back below <= 110°', () => {
    formAnalyzer.analyze(
      createMockFrame(0.9, 1000),
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 })
    );

    formAnalyzer.analyze(
      createMockFrame(0.9, 1500),
      createMockMetrics({ phase: 'BOTTOM', elbowAngle: 165 })
    );

    // Lowers only to 125° (incomplete lowering)
    formAnalyzer.analyze(
      createMockFrame(0.9, 2000),
      createMockMetrics({ phase: 'ECCENTRIC', elbowAngle: 125 })
    );

    formAnalyzer.analyze(
      createMockFrame(0.9, 2500),
      createMockMetrics({ phase: 'STANDING', reps: 1, elbowAngle: 125 })
    );

    const reps = formAnalyzer.getRepAssessments();
    expect(reps).toHaveLength(1);
    expect(reps[0].issues).toContain('INCOMPLETE_LOWERING');
  });

  it('detects EXCESSIVE_TORSO_LEAN when lumbar arching is detected', () => {
    for (let i = 0; i < 4; i++) {
      formAnalyzer.analyze(
        createMockFrame(0.9, 1000 + i * 50),
        createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 135 }),
        { torsoAngle: 150 } // 150 < 158 threshold
      );
    }

    const assessment = formAnalyzer.getAssessment();
    const leanIssue = assessment.issues.find(i => i.type === 'EXCESSIVE_TORSO_LEAN');
    expect(leanIssue).toBeDefined();
    expect(assessment.activeFeedback).toContain('avoid arching your lower back');
  });

  it('detects LEFT_RIGHT_ASYMMETRY when both arms differ during pressing', () => {
    for (let i = 0; i < 4; i++) {
      formAnalyzer.analyze(
        createMockFrame(0.9, 1000 + i * 50),
        createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 130 }),
        { leftRightDiff: 28, isBothArmsVisible: true } // 28 > 20 threshold
      );
    }

    const assessment = formAnalyzer.getAssessment();
    expect(assessment.issues.some(i => i.type === 'LEFT_RIGHT_ASYMMETRY')).toBe(true);
  });

  it('suppresses assessment warnings when confidence is low', () => {
    formAnalyzer.analyze(
      createMockFrame(0.3, 1000), // Below 0.5 confidence
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 130 }),
      { torsoAngle: 140 }
    );

    const assessment = formAnalyzer.getAssessment();
    expect(assessment.issues.some(i => i.type === 'LOW_CONFIDENCE')).toBe(true);
    expect(assessment.issues.some(i => i.type === 'EXCESSIVE_TORSO_LEAN')).toBe(false);
  });

  it('records 100 form score and Good rep feedback for flawless repetition', () => {
    // Concentric
    formAnalyzer.analyze(createMockFrame(0.9, 1000), createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 }));
    // Overhead lockout
    formAnalyzer.analyze(createMockFrame(0.9, 1800), createMockMetrics({ phase: 'BOTTOM', elbowAngle: 165 }));
    // Eccentric lowering
    formAnalyzer.analyze(createMockFrame(0.9, 2400), createMockMetrics({ phase: 'ECCENTRIC', elbowAngle: 120 }));
    // Return to rack
    formAnalyzer.analyze(createMockFrame(0.9, 3000), createMockMetrics({ phase: 'STANDING', reps: 1, elbowAngle: 85 }));

    const reps = formAnalyzer.getRepAssessments();
    expect(reps).toHaveLength(1);
    expect(reps[0].issues).toHaveLength(0);
    expect(reps[0].formScore).toBe(100);
    expect(formAnalyzer.getAssessment().activeFeedback).toBe('Good rep.');
  });
});
