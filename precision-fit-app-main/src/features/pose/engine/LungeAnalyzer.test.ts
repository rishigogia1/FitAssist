import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LungeAnalyzer, LUNGE_CONFIG } from './LungeAnalyzer';
import { SquatAnalyzer } from './SquatAnalyzer';
import { PushUpAnalyzer } from './PushUpAnalyzer';
import { ExerciseRegistry } from './ExerciseRegistry';
import { PdfReportGenerator, AnalysisResultData } from '../reports/PdfReportGenerator';
import { PoseFrame, PoseLandmark } from '../types';

/**
 * Creates deterministic synthetic PoseFrames for lunge testing.
 */
function createLungeFrame(options: {
  leftKneeAngle?: number;
  rightKneeAngle?: number;
  kneeAngle?: number;
  leftAnkleX?: number;
  rightAnkleX?: number;
  torsoAngle?: number;
  confidence?: number;
  leftLegVisible?: boolean;
  rightLegVisible?: boolean;
  torsoVisible?: boolean;
  timestamp?: number;
}): PoseFrame {
  const {
    kneeAngle = 170,
    leftKneeAngle,
    rightKneeAngle,
    leftAnkleX = 0.5,
    rightAnkleX = 0.5,
    torsoAngle = 175,
    confidence = 0.95,
    leftLegVisible = true,
    rightLegVisible = true,
    torsoVisible = true,
    timestamp = Date.now(),
  } = options;

  const landmarks: PoseLandmark[] = Array(33).fill(null).map((_, id) => ({
    id,
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: confidence
  }));

  const lAngle = leftKneeAngle ?? kneeAngle;
  const rAngle = rightKneeAngle ?? kneeAngle;

  const lPhi = -Math.PI / 2 + (lAngle * Math.PI) / 180;
  const rPhi = -Math.PI / 2 + (rAngle * Math.PI) / 180;
  const L = 0.25;

  // Hips
  landmarks[23] = { id: 23, x: 0.5, y: 0.4, z: 0.0, visibility: leftLegVisible ? confidence : 0.1 };
  landmarks[24] = { id: 24, x: 0.5, y: 0.4, z: 0.0, visibility: rightLegVisible ? confidence : 0.1 };

  // Knees at (0.5, 0.65)
  landmarks[25] = { id: 25, x: 0.5, y: 0.65, z: 0.0, visibility: leftLegVisible ? confidence : 0.1 };
  landmarks[26] = { id: 26, x: 0.5, y: 0.65, z: 0.0, visibility: rightLegVisible ? confidence : 0.1 };

  // Left Ankle
  landmarks[27] = { 
    id: 27, 
    x: 0.5 + L * Math.cos(lPhi) + (leftAnkleX - 0.5), 
    y: 0.65 + L * Math.sin(lPhi), 
    z: 0.0, 
    visibility: leftLegVisible ? confidence : 0.1 
  };

  // Right Ankle
  landmarks[28] = { 
    id: 28, 
    x: 0.5 + L * Math.cos(rPhi) + (rightAnkleX - 0.5), 
    y: 0.65 + L * Math.sin(rPhi), 
    z: 0.0, 
    visibility: rightLegVisible ? confidence : 0.1 
  };

  // Torso / Shoulder
  const psi = Math.PI / 2 - (torsoAngle * Math.PI) / 180;
  const shoulderVis = torsoVisible ? confidence : 0.1;
  landmarks[11] = { 
    id: 11, 
    x: 0.5 + 0.25 * Math.cos(psi), 
    y: 0.4 + 0.25 * Math.sin(psi), 
    z: 0.0, 
    visibility: shoulderVis 
  };
  landmarks[12] = { 
    id: 12, 
    x: 0.5 + 0.25 * Math.cos(psi), 
    y: 0.4 + 0.25 * Math.sin(psi), 
    z: 0.0, 
    visibility: shoulderVis 
  };

  return {
    timestamp,
    landmarks,
    confidence,
    inferenceLatencyMs: 12
  };
}

describe('LungeAnalyzer & Lunge Form Assessment', () => {
  let analyzer: LungeAnalyzer;

  beforeEach(() => {
    analyzer = new LungeAnalyzer();
    analyzer.reset();
  });

  it('1. Correct analyzer identity and contract', () => {
    expect(analyzer.exerciseType).toBe('LUNGE');
    expect(analyzer.isRepetitionBased).toBe(true);
    const initial = analyzer.getMetrics();
    expect(initial.exercise).toBe('LUNGE');
    expect(initial.reps).toBe(0);
    expect(initial.phase).toBe('IDLE');
    expect(initial.elbowAngle).toBeNull();
  });

  it('2. Starting standing position does not count as a rep', () => {
    let t = 1000;
    // User stands still for 15 frames
    for (let i = 0; i < 15; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
      t += 50;
    }
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.reps).toBe(0);
  });

  it('3. A valid lunge cycle counts exactly one rep', () => {
    let t = 1000;

    // 1. Establish Standing position
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        kneeAngle: 170, 
        leftAnkleX: 0.5, 
        rightAnkleX: 0.5, 
        timestamp: t 
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('STANDING');
    expect(analyzer.getMetrics().reps).toBe(0);

    // 2. Step forward into ECCENTRIC descent (split stance, front knee bends < 145°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        leftKneeAngle: 125, 
        rightKneeAngle: 135,
        leftAnkleX: 0.65, // Left foot stepped forward
        rightAnkleX: 0.45,
        timestamp: t 
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');

    // 3. Reach valid BOTTOM position (front knee <= 100°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        leftKneeAngle: 90, 
        rightKneeAngle: 95,
        leftAnkleX: 0.65, 
        rightAnkleX: 0.45,
        timestamp: t 
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');

    // 4. Push back up into CONCENTRIC phase (> 100 + 8°)
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        leftKneeAngle: 130, 
        rightKneeAngle: 140,
        leftAnkleX: 0.65, 
        rightAnkleX: 0.45,
        timestamp: t 
      }));
      t += 100;
    }
    expect(analyzer.getMetrics().phase).toBe('CONCENTRIC');

    // 5. Return to STANDING (>= 155°) after valid duration
    t += 300;
    for (let i = 0; i < 6; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        kneeAngle: 170, 
        leftAnkleX: 0.5, 
        rightAnkleX: 0.5, 
        timestamp: t 
      }));
      t += 50;
    }

    // Repetition must be counted exactly once
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(1);
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.rangeOfMotion).toBeGreaterThan(60);
    expect(metrics.repDurationMs).toBeGreaterThan(500);

    const assessments = analyzer.getRepAssessments();
    expect(assessments).toHaveLength(1);
    expect(assessments[0].repNumber).toBe(1);
  });

  it('4. Incomplete descent does not count as a rep', () => {
    let t = 1000;
    // Standing
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
      t += 50;
    }
    // Only bends to 125° (does NOT reach bottom <= 100°)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 125, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');

    // Returns directly to standing
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
      t += 50;
    }

    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('STANDING');
  });

  it('5. Partial return does not count as a completed rep', () => {
    let t = 1000;
    // Establish standing
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
      t += 50;
    }
    // Move to bottom
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 125, timestamp: t }));
      t += 50;
    }
    for (let i = 0; i < 6; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 90, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');

    // Ascends only to 125° (not reaching standing >= 155°)
    for (let i = 0; i < 3; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 125, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('CONCENTRIC');

    // Drops back down to 90°
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 90, timestamp: t }));
      t += 50;
    }

    // Must NOT count rep
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(['ECCENTRIC', 'BOTTOM']).toContain(analyzer.getMetrics().phase);
  });

  it('6. Repeated frames at the bottom do not create duplicate reps', () => {
    let t = 1000;
    analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
    t += 50;
    analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 125, timestamp: t }));
    t += 50;
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 90, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');
  });

  it('7. Repeated frames at the top do not create duplicate reps', () => {
    let t = 1000;
    for (let i = 0; i < 25; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('STANDING');
  });

  it('8. Small coordinate noise does not trigger false repetitions', () => {
    let t = 1000;
    for (let i = 0; i < 20; i++) {
      const noisyAngle = 170 + (i % 2 === 0 ? 3 : -3);
      analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: noisyAngle, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('STANDING');
  });

  it('9. Missing knee landmarks do not produce fabricated angles', () => {
    const frame = createLungeFrame({ leftLegVisible: false, rightLegVisible: false });
    analyzer.analyzePoseFrame(frame);

    const metrics = analyzer.getMetrics();
    expect(metrics.kneeAngle).toBeNull();
    expect(metrics.leftKneeAngle).toBeNull();
    expect(metrics.rightKneeAngle).toBeNull();
  });

  it('10. Low-confidence landmarks suppress unsupported warnings', () => {
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ confidence: 0.3, timestamp: t }));
      t += 50;
    }

    const assessment = analyzer.getFormAssessment();
    expect(assessment.activeFeedback).toContain('visible');
    expect(assessment.issues.some(i => i.type === 'EXCESSIVE_FORWARD_LEAN')).toBe(false);
    expect(assessment.issues.some(i => i.type === 'INSUFFICIENT_DEPTH')).toBe(false);
  });

  it('11. Active-leg identity becomes UNKNOWN when ambiguous', () => {
    let t = 1000;
    // Ankles are close together (stanceWidth < 0.08)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        leftAnkleX: 0.50, 
        rightAnkleX: 0.52, 
        kneeAngle: 120, 
        timestamp: t 
      }));
      t += 50;
    }
    expect(analyzer.getMetrics().activeLeg).toBe('UNKNOWN');
  });

  it('12. Left/right metrics are produced accurately when supported by input landmarks', () => {
    let t = 1000;
    // Left foot forward (0.65), right foot back (0.42)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createLungeFrame({ 
        leftKneeAngle: 92, 
        rightKneeAngle: 105,
        leftAnkleX: 0.65, 
        rightAnkleX: 0.42, 
        timestamp: t 
      }));
      t += 50;
    }
    const metrics = analyzer.getMetrics();
    expect(metrics.activeLeg).toBe('LEFT');
    expect(metrics.frontKneeAngle).toBeDefined();
    expect(metrics.rearKneeAngle).toBeDefined();
    expect(metrics.leftKneeAngle).toBeDefined();
  });

  it('13. Reset clears previous repetitions and extrema', () => {
    let t = 1000;
    analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170, timestamp: t }));
    t += 50;
    analyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 90, timestamp: t }));

    analyzer.reset();
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.kneeAngle).toBeNull();
    expect(analyzer.getRepAssessments()).toHaveLength(0);
  });

  it('14. Switching from Squat to Lunge does not leak state', () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    const lungeAnalyzer = ExerciseRegistry.getAnalyzer('LUNGE');

    expect(squatAnalyzer).toBeInstanceOf(SquatAnalyzer);
    expect(lungeAnalyzer).toBeInstanceOf(LungeAnalyzer);

    lungeAnalyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170 }));
    expect(lungeAnalyzer.getMetrics().exercise).toBe('LUNGE');
    expect(squatAnalyzer.getMetrics().exercise).toBe('SQUAT');
    expect(squatAnalyzer.getMetrics().reps).toBe(0);
  });

  it('15. Switching from Push-up to Lunge does not leak state', () => {
    const pushUpAnalyzer = ExerciseRegistry.getAnalyzer('PUSH_UP');
    const lungeAnalyzer = ExerciseRegistry.getAnalyzer('LUNGE');

    expect(pushUpAnalyzer).toBeInstanceOf(PushUpAnalyzer);
    expect(lungeAnalyzer).toBeInstanceOf(LungeAnalyzer);

    lungeAnalyzer.analyzePoseFrame(createLungeFrame({ kneeAngle: 170 }));
    expect(lungeAnalyzer.getMetrics().exercise).toBe('LUNGE');
    expect(pushUpAnalyzer.getMetrics().exercise).toBe('PUSH_UP');
    expect(pushUpAnalyzer.getMetrics().reps).toBe(0);
  });

  it('16. Unsupported exercise types remain unsupported', () => {
    expect(ExerciseRegistry.isImplemented('SQUAT')).toBe(true);
    expect(ExerciseRegistry.isImplemented('PUSH_UP')).toBe(true);
    expect(ExerciseRegistry.isImplemented('LUNGE')).toBe(true);
    expect(ExerciseRegistry.isImplemented('BICEP_CURL')).toBe(true);
    expect(ExerciseRegistry.isImplemented('SHOULDER_PRESS')).toBe(true);
    expect(ExerciseRegistry.isImplemented('PLANK')).toBe(false);
  });

  it('17. PDF generation accepts Lunge result structure', async () => {
    const spy = vi.spyOn(PdfReportGenerator, 'generateReport').mockImplementation(async (data: AnalysisResultData) => {
      expect(data.exercise).toBe('LUNGE');
      expect(data.metrics?.exercise).toBe('LUNGE');
      expect(data.repAssessments).toBeDefined();
    });

    const data: AnalysisResultData = {
      exercise: 'LUNGE',
      originalFilename: 'lunge_test.mp4',
      date: new Date(),
      status: 'Completed',
      metrics: analyzer.getMetrics(),
      formAssessment: analyzer.getFormAssessment(),
      repAssessments: analyzer.getRepAssessments()
    };

    await PdfReportGenerator.generateReport(data);
    expect(spy).toHaveBeenCalledWith(data);
    spy.mockRestore();
  });
});
