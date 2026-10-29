import { describe, it, expect, beforeEach } from 'vitest';
import { ShoulderPressAnalyzer } from './ShoulderPressAnalyzer';
import { PdfReportGenerator, AnalysisResultData } from '../reports/PdfReportGenerator';
import { PoseFrame, PoseLandmark } from '../types';

/**
 * Creates deterministic synthetic PoseFrames for shoulder press testing.
 */
function createShoulderPressFrame(options: {
  elbowAngle?: number;
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  torsoAngle?: number;
  confidence?: number;
  leftArmVisible?: boolean;
  rightArmVisible?: boolean;
  timestamp?: number;
}): PoseFrame {
  const {
    elbowAngle = 85,
    leftElbowAngle,
    rightElbowAngle,
    torsoAngle = 180,
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
  landmarks[11] = { id: 11, x: 0.4, y: 0.4, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[13] = { id: 13, x: 0.35, y: 0.5, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[15] = {
    id: 15,
    x: 0.35 + 0.2 * Math.sin(Math.PI - leftRad),
    y: 0.5 + 0.2 * Math.cos(Math.PI - leftRad),
    z: 0.0,
    visibility: leftArmVisible ? confidence : 0.1
  };

  // Right arm: 12 (shoulder), 14 (elbow), 16 (wrist)
  landmarks[12] = { id: 12, x: 0.6, y: 0.4, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[14] = { id: 14, x: 0.65, y: 0.5, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[16] = {
    id: 16,
    x: 0.65 + 0.2 * Math.sin(Math.PI - rightRad),
    y: 0.5 + 0.2 * Math.cos(Math.PI - rightRad),
    z: 0.0,
    visibility: rightArmVisible ? confidence : 0.1
  };

  // Torso / Hips: 23 (left hip), 24 (right hip), 25 (left knee), 26 (right knee)
  const torsoRad = (torsoAngle * Math.PI) / 180;
  landmarks[23] = { id: 23, x: 0.45, y: 0.7, z: 0.0, visibility: confidence };
  landmarks[24] = { id: 24, x: 0.55, y: 0.7, z: 0.0, visibility: confidence };
  landmarks[25] = {
    id: 25,
    x: 0.45 + 0.2 * Math.sin(Math.PI - torsoRad),
    y: 0.7 + 0.2 * Math.cos(Math.PI - torsoRad),
    z: 0.0,
    visibility: confidence
  };
  landmarks[26] = {
    id: 26,
    x: 0.55 + 0.2 * Math.sin(Math.PI - torsoRad),
    y: 0.7 + 0.2 * Math.cos(Math.PI - torsoRad),
    z: 0.0,
    visibility: confidence
  };

  return {
    landmarks,
    timestamp,
    confidence,
    inferenceLatencyMs: 8
  };
}

describe('ShoulderPressAnalyzer', () => {
  let analyzer: ShoulderPressAnalyzer;

  beforeEach(() => {
    analyzer = new ShoulderPressAnalyzer();
  });

  it('correctly declares SHOULDER_PRESS exercise identity and initial state', () => {
    expect(analyzer.exerciseType).toBe('SHOULDER_PRESS');
    const metrics = analyzer.getMetrics();
    expect(metrics.exercise).toBe('SHOULDER_PRESS');
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.reps).toBe(0);
    expect(metrics.depth).toBeNull();
  });

  it('does not count initial rack position as a rep', () => {
    for (let i = 0; i < 15; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: 1000 + i * 50 }));
    }
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('STANDING');
  });

  it('counts exactly one repetition for a complete valid overhead press cycle', () => {
    let t = 1000;
    // 1. Establish initial rack position (85°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('STANDING');

    // 2. Press upward into concentric phase (85° -> 120° -> 165°)
    for (const angle of [100, 118, 135, 152]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 165, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM'); // Overhead lockout reached
    expect(analyzer.getMetrics().romPercent).toBeGreaterThan(80);

    // 3. Lower under control back to shoulders (165° -> 85°)
    for (const angle of [145, 125, 110]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 120;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 120;
    }

    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(1);
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.rangeOfMotion).toBeGreaterThan(60);
    expect(metrics.repDurationMs).toBeGreaterThan(600);
  });

  it('does not count a partial press as a completed rep', () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }

    // Partial press: only reaches 125° (does not reach >= 150° overhead lockout)
    for (const angle of [105, 125, 115, 90]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }

    expect(analyzer.getMetrics().reps).toBe(0);
  });

  it('does not count multiple reps when user statically holds weights overhead', () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }

    // Press up to lockout
    for (const angle of [100, 118, 135, 152]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 165, timestamp: t }));
      t += 100;
    }

    // Hold overhead for 2 seconds (20 frames)
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 165, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(0);

    // Lower back to rack
    for (const angle of [145, 125, 110]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().reps).toBe(1);
  });

  it('calculates ROM in increasing direction as arms press overhead', () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    const startRom = analyzer.getMetrics().romPercent;

    analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 125, timestamp: t }));
    const midRom = analyzer.getMetrics().romPercent;

    analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 160, timestamp: t + 100 }));
    const lockoutRom = analyzer.getMetrics().romPercent;

    expect(midRom).toBeGreaterThan(startRom ?? 0);
    expect(lockoutRom).toBeGreaterThan(midRom ?? 0);
  });

  it('resets state, calibration, and repetition counters correctly', () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    for (const angle of [100, 118, 135, 152]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 165, timestamp: t }));
      t += 100;
    }
    for (const angle of [145, 125, 110]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
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

  it('allows PDF report generator to export Shoulder Press results without errors', async () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    for (const angle of [100, 118, 135, 152]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 165, timestamp: t }));
      t += 100;
    }
    for (const angle of [145, 125, 110]) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: angle, timestamp: t }));
      t += 100;
    }
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createShoulderPressFrame({ elbowAngle: 85, timestamp: t }));
      t += 100;
    }

    const reportData: AnalysisResultData = {
      exercise: 'SHOULDER_PRESS',
      originalFilename: 'shoulder_press.mp4',
      date: new Date(),
      status: 'Completed',
      metrics: analyzer.getMetrics(),
      formAssessment: analyzer.getFormAssessment(),
      repAssessments: analyzer.getRepAssessments(),
    };

    expect(reportData.repAssessments.length).toBeGreaterThan(0);
    expect(reportData.repAssessments[0].depth).toBeNull();
    expect(reportData.repAssessments[0].rom).toBeGreaterThan(60);

    await expect(PdfReportGenerator.generateReport(reportData)).resolves.not.toThrow();
  });
});
