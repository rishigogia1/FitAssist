import { describe, it, expect, beforeEach } from 'vitest';
import { BicepCurlFormAnalyzer, BICEP_CURL_FORM_CONFIG } from './BicepCurlFormAnalyzer';
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
    exercise: 'BICEP_CURL',
    phase: 'STANDING',
    reps: 0,
    currentRep: 0,
    holdDurationMs: null,
    holdDurationSec: null,
    kneeAngle: null,
    leftKneeAngle: null,
    rightKneeAngle: null,
    hipAngle: 180,
    elbowAngle: 160,
    rangeOfMotion: null,
    romPercent: null,
    depth: null,
    repDurationMs: null,
    confidence: 0.9,
    timestamp: 1000,
    ...overrides
  };
}

describe('BicepCurlFormAnalyzer', () => {
  let formAnalyzer: BicepCurlFormAnalyzer;

  beforeEach(() => {
    formAnalyzer = new BicepCurlFormAnalyzer();
  });

  it('detects INCOMPLETE_CURL when rep fails to reach <= 75° flexion', () => {
    // Start concentric
    formAnalyzer.analyze(
      createMockFrame(0.9, 1000),
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 })
    );

    // Flexion only reaches 90° (incomplete curl)
    formAnalyzer.analyze(
      createMockFrame(0.9, 1500),
      createMockMetrics({ phase: 'BOTTOM', elbowAngle: 90 })
    );

    // Eccentric lowering
    formAnalyzer.analyze(
      createMockFrame(0.9, 2000),
      createMockMetrics({ phase: 'ECCENTRIC', elbowAngle: 130 })
    );

    // Return to standing
    formAnalyzer.analyze(
      createMockFrame(0.9, 2500),
      createMockMetrics({ phase: 'STANDING', reps: 1, elbowAngle: 160 })
    );

    const reps = formAnalyzer.getRepAssessments();
    expect(reps).toHaveLength(1);
    expect(reps[0].issues).toContain('INCOMPLETE_CURL');
    expect(reps[0].formScore).toBeLessThan(100);
  });

  it('detects INCOMPLETE_EXTENSION when user does not extend arm back to >= 140°', () => {
    // Concentric
    formAnalyzer.analyze(
      createMockFrame(0.9, 1000),
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 })
    );

    // Bottom valid flexion
    formAnalyzer.analyze(
      createMockFrame(0.9, 1500),
      createMockMetrics({ phase: 'BOTTOM', elbowAngle: 50 })
    );

    // Returns only to 125° (incomplete extension)
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
    expect(reps[0].issues).toContain('INCOMPLETE_EXTENSION');
  });

  it('detects EXCESSIVE_ELBOW_DRIFT when elbows flare forward or backward', () => {
    // 3 persistent frames of excessive elbow drift
    for (let i = 0; i < 4; i++) {
      formAnalyzer.analyze(
        createMockFrame(0.9, 1000 + i * 50),
        createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 100 }),
        { elbowDrift: 0.22 } // 0.22 > 0.14 threshold
      );
    }

    const assessment = formAnalyzer.getAssessment();
    const driftIssue = assessment.issues.find(i => i.type === 'EXCESSIVE_ELBOW_DRIFT');
    expect(driftIssue).toBeDefined();
    expect(assessment.activeFeedback).toContain('pinned at your sides');
  });

  it('detects EXCESSIVE_SWING when torso inclination shifts noticeably', () => {
    for (let i = 0; i < 4; i++) {
      formAnalyzer.analyze(
        createMockFrame(0.9, 1000 + i * 50),
        createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 90 }),
        { torsoSway: 25 } // 25 > 15 threshold
      );
    }

    const assessment = formAnalyzer.getAssessment();
    const swingIssue = assessment.issues.find(i => i.type === 'EXCESSIVE_SWING');
    expect(swingIssue).toBeDefined();
    expect(assessment.activeFeedback).toContain('avoid using momentum');
  });

  it('detects LEFT_RIGHT_ASYMMETRY when both arms are visible and differ significantly', () => {
    for (let i = 0; i < 4; i++) {
      formAnalyzer.analyze(
        createMockFrame(0.9, 1000 + i * 50),
        createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 85 }),
        { leftRightDiff: 30, isBothArmsVisible: true } // 30 > 22 threshold
      );
    }

    const assessment = formAnalyzer.getAssessment();
    expect(assessment.issues.some(i => i.type === 'LEFT_RIGHT_ASYMMETRY')).toBe(true);
  });

  it('suppresses assessment warnings when confidence is low', () => {
    formAnalyzer.analyze(
      createMockFrame(0.3, 1000), // Below 0.5 confidence
      createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 90 }),
      { elbowDrift: 0.3 }
    );

    const assessment = formAnalyzer.getAssessment();
    expect(assessment.issues.some(i => i.type === 'LOW_CONFIDENCE')).toBe(true);
    expect(assessment.issues.some(i => i.type === 'EXCESSIVE_ELBOW_DRIFT')).toBe(false);
  });

  it('records 100 form score and Good rep feedback for flawless repetition', () => {
    // Concentric
    formAnalyzer.analyze(createMockFrame(0.9, 1000), createMockMetrics({ phase: 'CONCENTRIC', elbowAngle: 120 }));
    // Bottom peak
    formAnalyzer.analyze(createMockFrame(0.9, 1800), createMockMetrics({ phase: 'BOTTOM', elbowAngle: 50 }));
    // Eccentric
    formAnalyzer.analyze(createMockFrame(0.9, 2400), createMockMetrics({ phase: 'ECCENTRIC', elbowAngle: 120 }));
    // Standing completion
    formAnalyzer.analyze(createMockFrame(0.9, 3000), createMockMetrics({ phase: 'STANDING', reps: 1, elbowAngle: 160 }));

    const reps = formAnalyzer.getRepAssessments();
    expect(reps).toHaveLength(1);
    expect(reps[0].issues).toHaveLength(0);
    expect(reps[0].formScore).toBe(100);
    expect(formAnalyzer.getAssessment().activeFeedback).toBe('Good rep.');
  });
});
