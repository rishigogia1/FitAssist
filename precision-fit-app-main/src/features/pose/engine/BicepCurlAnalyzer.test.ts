import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BicepCurlAnalyzer } from './BicepCurlAnalyzer';
import { ExerciseRegistry } from './ExerciseRegistry';
import { PdfReportGenerator, AnalysisResultData } from '../reports/PdfReportGenerator';
import { PoseFrame, PoseLandmark } from '../types';

/**
 * Creates deterministic synthetic PoseFrames for bicep curl testing.
 */
function createBicepCurlFrame(options: {
  elbowAngle?: number;
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  elbowDriftX?: number;
  torsoSwayX?: number;
  confidence?: number;
  leftArmVisible?: boolean;
  rightArmVisible?: boolean;
  timestamp?: number;
}): PoseFrame {
  const {
    elbowAngle = 160,
    leftElbowAngle,
    rightElbowAngle,
    elbowDriftX = 0,
    torsoSwayX = 0,
    confidence = 0.95,
    leftArmVisible = true,
    rightArmVisible = true,
    timestamp = 1000,
  } = options;

  const landmarks: PoseLandmark[] = Array(33).fill(null).map((_, id) => ({
    id,
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: confidence
  }));

  const leftAngle = leftElbowAngle ?? elbowAngle;
  const rightAngle = rightElbowAngle ?? elbowAngle;

  const leftRad = (leftAngle * Math.PI) / 180;
  const rightRad = (rightAngle * Math.PI) / 180;

  // Left arm: 11 (shoulder), 13 (elbow), 15 (wrist)
  landmarks[11] = { id: 11, x: 0.4 + torsoSwayX, y: 0.3, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[13] = { id: 13, x: 0.4 + elbowDriftX, y: 0.5, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[15] = {
    id: 15,
    x: 0.4 + elbowDriftX + 0.2 * Math.sin(Math.PI - leftRad),
    y: 0.5 + 0.2 * Math.cos(Math.PI - leftRad),
    z: 0.0,
    visibility: leftArmVisible ? confidence : 0.1
  };

  // Right arm: 12 (shoulder), 14 (elbow), 16 (wrist)
  landmarks[12] = { id: 12, x: 0.6 + torsoSwayX, y: 0.3, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[14] = { id: 14, x: 0.6 + elbowDriftX, y: 0.5, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[16] = {
    id: 16,
    x: 0.6 + elbowDriftX + 0.2 * Math.sin(Math.PI - rightRad),
    y: 0.5 + 0.2 * Math.cos(Math.PI - rightRad),
    z: 0.0,
    visibility: rightArmVisible ? confidence : 0.1
  };

  // Hips for torso orientation
  landmarks[23] = { id: 23, x: 0.45, y: 0.65, z: 0.0, visibility: confidence };
  landmarks[24] = { id: 24, x: 0.55, y: 0.65, z: 0.0, visibility: confidence };

  return {
    landmarks,
    timestamp,
    confidence,
    inferenceLatencyMs: 8
  };
}

describe('BicepCurlAnalyzer', () => {
  let analyzer: BicepCurlAnalyzer;

  beforeEach(() => {
    analyzer = new BicepCurlAnalyzer();
  });

  it('correctly declares BICEP_CURL exercise identity and initial state', () => {
    expect(analyzer.exerciseType).toBe('BICEP_CURL');
    const metrics = analyzer.getMetrics();
    expect(metrics.exercise).toBe('BICEP_CURL');
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.reps).toBe(0);
    expect(metrics.depth).toBeNull();
  });

  it('does not count initial extended position as a rep', () => {
    for (let i = 0; i < 15; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: 1000 + i * 50 }));
    }
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('STANDING');
  });

  it('counts exactly one repetition for a complete valid curl cycle', () => {
    let t = 1000;
    // 1. Establish initial extended pose (160°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('STANDING');

    // 2. Concentric curl upward (160° -> 110° -> 50°)
    for (const angle of [140, 120, 95, 75, 55]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 45, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');
    expect(analyzer.getMetrics().romPercent).toBeGreaterThan(80);

    // 3. Lower under control back to extension (50° -> 155°)
    for (const angle of [70, 95, 120, 140]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 120;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 120;
    }

    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(1);
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.rangeOfMotion).toBeGreaterThan(90);
    expect(metrics.repDurationMs).toBeGreaterThan(600);
  });

  it('does not count a partial curl as a completed rep', () => {
    let t = 1000;
    // Extended
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 50;
    }

    // Incomplete curl: only reaches 105° (does not reach <= 70° threshold)
    for (const angle of [140, 125, 105, 115, 145, 160]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }

    expect(analyzer.getMetrics().reps).toBe(0);
  });

  it('does not count multiple reps when user statically holds contracted or extended position', () => {
    let t = 1000;
    // Set standing
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 50;
    }

    // Curl to peak
    for (const angle of [130, 90, 50]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }

    // Hold contracted for 2 seconds (20 frames)
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 45, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(0);

    // Return to extension
    for (const angle of [80, 110, 145]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(1);

    // Hold extended for 2 seconds
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(1);
  });

  it('identifies unilateral active arm accurately', () => {
    let t = 1000;
    // Left arm curling (50°), right arm stationary extended (160°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({
        leftElbowAngle: 50,
        rightElbowAngle: 160,
        timestamp: t
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().activeArm).toBe('LEFT');

    // Right arm curling (50°), left arm extended (160°)
    analyzer.reset();
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({
        leftElbowAngle: 160,
        rightElbowAngle: 50,
        timestamp: t
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().activeArm).toBe('RIGHT');

    // Both arms curling together
    analyzer.reset();
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({
        leftElbowAngle: 55,
        rightElbowAngle: 52,
        timestamp: t
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().activeArm).toBe('BOTH');
  });

  it('returns UNKNOWN active arm and suppresses angles when landmarks are missing or low-confidence', () => {
    analyzer.analyzePoseFrame(createBicepCurlFrame({ confidence: 0.2 }));
    const metrics = analyzer.getMetrics();
    expect(metrics.activeArm).toBe('UNKNOWN');
    expect(metrics.elbowAngle).toBeNull();
  });

  it('resets state, calibration, and repetition counters correctly', () => {
    let t = 1000;
    // Perform a rep
    for (let i = 0; i < 3; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 50;
    }
    for (const angle of [130, 80]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 45, timestamp: t }));
      t += 100;
    }
    for (const angle of [80, 130]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(1);

    analyzer.reset();
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.rangeOfMotion).toBeNull();
    expect(analyzer.getRepAssessments()).toHaveLength(0);
  });

  it('allows PDF report generator to export Bicep Curl results without errors', async () => {
    let t = 1000;
    for (let i = 0; i < 3; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 50;
    }
    for (const angle of [130, 80]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 45, timestamp: t }));
      t += 100;
    }
    for (const angle of [80, 130]) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createBicepCurlFrame({ elbowAngle: 160, timestamp: t }));
      t += 100;
    }

    const reportData: AnalysisResultData = {
      exercise: 'BICEP_CURL',
      originalFilename: 'bicep_curls.mp4',
      date: new Date(),
      status: 'Completed',
      metrics: analyzer.getMetrics(),
      formAssessment: analyzer.getFormAssessment(),
      repAssessments: analyzer.getRepAssessments(),
    };

    expect(reportData.repAssessments.length).toBeGreaterThan(0);
    expect(reportData.repAssessments[0].depth).toBeNull();
    expect(reportData.repAssessments[0].rom).toBeGreaterThan(80);

    // Verify generateReport doesn't throw
    await expect(PdfReportGenerator.generateReport(reportData)).resolves.not.toThrow();
  });
});
