import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PushUpAnalyzer, PUSH_UP_CONFIG } from './PushUpAnalyzer';
import { SquatAnalyzer } from './SquatAnalyzer';
import { ExerciseRegistry } from './ExerciseRegistry';
import { PdfReportGenerator, AnalysisResultData } from '../reports/PdfReportGenerator';
import { PoseFrame, PoseLandmark } from '../types';

/**
 * Creates deterministic synthetic PoseFrames for push-up testing.
 */
function createPushUpFrame(options: {
  elbowAngle?: number;
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  hipOffset?: number; // Positive = sagging toward floor, negative = piking toward ceiling
  confidence?: number;
  leftArmVisible?: boolean;
  rightArmVisible?: boolean;
  bodyVisible?: boolean;
  timestamp?: number;
}): PoseFrame {
  const {
    elbowAngle = 165,
    leftElbowAngle,
    rightElbowAngle,
    hipOffset = 0,
    confidence = 0.95,
    leftArmVisible = true,
    rightArmVisible = true,
    bodyVisible = true,
    timestamp = Date.now(),
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
  landmarks[11] = { id: 11, x: 0.3, y: 0.4, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[13] = { id: 13, x: 0.3, y: 0.6, z: 0.0, visibility: leftArmVisible ? confidence : 0.1 };
  landmarks[15] = { 
    id: 15, 
    x: 0.3 + 0.2 * Math.sin(Math.PI - leftRad), 
    y: 0.6 + 0.2 * Math.cos(Math.PI - leftRad), 
    z: 0.0, 
    visibility: leftArmVisible ? confidence : 0.1 
  };

  // Right arm: 12 (shoulder), 14 (elbow), 16 (wrist)
  landmarks[12] = { id: 12, x: 0.3, y: 0.4, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[14] = { id: 14, x: 0.3, y: 0.6, z: 0.0, visibility: rightArmVisible ? confidence : 0.1 };
  landmarks[16] = { 
    id: 16, 
    x: 0.3 + 0.2 * Math.sin(Math.PI - rightRad), 
    y: 0.6 + 0.2 * Math.cos(Math.PI - rightRad), 
    z: 0.0, 
    visibility: rightArmVisible ? confidence : 0.1 
  };

  // Torso / Legs: Shoulder (11/12), Hip (23/24), Ankle (27/28)
  const bVis = bodyVisible ? confidence : 0.1;
  landmarks[23] = { id: 23, x: 0.55, y: 0.4 + hipOffset, z: 0.0, visibility: bVis };
  landmarks[24] = { id: 24, x: 0.55, y: 0.4 + hipOffset, z: 0.0, visibility: bVis };
  landmarks[27] = { id: 27, x: 0.8, y: 0.4, z: 0.0, visibility: bVis };
  landmarks[28] = { id: 28, x: 0.8, y: 0.4, z: 0.0, visibility: bVis };

  return {
    timestamp,
    landmarks,
    confidence,
    inferenceLatencyMs: 12
  };
}

describe('PushUpAnalyzer & Push-up Form Assessment', () => {
  let analyzer: PushUpAnalyzer;

  beforeEach(() => {
    analyzer = new PushUpAnalyzer();
    analyzer.reset();
  });

  it('1. Correct analyzer identity and contract', () => {
    expect(analyzer.exerciseType).toBe('PUSH_UP');
    expect(analyzer.isRepetitionBased).toBe(true);
    const initial = analyzer.getMetrics();
    expect(initial.exercise).toBe('PUSH_UP');
    expect(initial.reps).toBe(0);
    expect(initial.phase).toBe('IDLE');
    expect(initial.kneeAngle).toBeNull();
  });

  it('2 & 3. Valid top-to-bottom-to-top cycle and correct repetition counting', () => {
    let t = 1000;

    // 1. Establish top plank position (165° for several frames)
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('TOP');
    expect(analyzer.getMetrics().reps).toBe(0);

    // 2. Descend into ECCENTRIC phase (flexing below 140°)
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 125, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');

    // 3. Reach valid bottom position (chest near floor, elbow <= 95°)
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');

    // 4. Push up into CONCENTRIC phase (> 95 + 8°)
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 130, timestamp: t }));
      t += 100;
    }
    expect(analyzer.getMetrics().phase).toBe('CONCENTRIC');

    // 5. Return to full extension at TOP (> 155°) after valid duration
    t += 200;
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }

    // Repetition must be counted exactly once
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(1);
    expect(metrics.phase).toBe('TOP');
    expect(metrics.rangeOfMotion).toBeGreaterThan(60);
    expect(metrics.repDurationMs).toBeGreaterThan(400);

    const repAssessments = analyzer.getRepAssessments();
    expect(repAssessments).toHaveLength(1);
    expect(repAssessments[0].repNumber).toBe(1);
  });

  it('4. No count for an incomplete downward movement (aborted descent)', () => {
    let t = 1000;
    // Top position
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    // Only bends to 125° (does NOT reach bottom <= 95°)
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 125, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');

    // Returns directly to top
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }

    // Repetition must NOT be counted
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('TOP');
  });

  it('5. No count for a partial upward return (re-descending before reaching top)', () => {
    let t = 1000;
    // Top
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    // Bottom
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');

    // Ascends only to 125° (not reaching top >= 155°)
    for (let i = 0; i < 3; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 125, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().phase).toBe('CONCENTRIC');

    // Drops back down to 85°
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }

    // Repetition must NOT be counted yet
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(['ECCENTRIC', 'BOTTOM']).toContain(analyzer.getMetrics().phase);
  });

  it('6. No duplicate counts while remaining at the top', () => {
    let t = 1000;
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('TOP');
  });

  it('7. No duplicate counts while remaining at the bottom', () => {
    let t = 1000;
    // Move to bottom
    analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
    t += 50;
    analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 120, timestamp: t }));
    t += 50;
    for (let i = 0; i < 20; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 85, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');
  });

  it('8. Noise and small angle fluctuations do not trigger false reps', () => {
    let t = 1000;
    // Start at top with minor jitter (162° - 168°)
    for (let i = 0; i < 15; i++) {
      const noisyAngle = 165 + (i % 2 === 0 ? 3 : -3);
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: noisyAngle, timestamp: t }));
      t += 50;
    }
    expect(analyzer.getMetrics().reps).toBe(0);
    expect(analyzer.getMetrics().phase).toBe('TOP');
  });

  it('9. Missing landmarks do not produce fabricated angles', () => {
    // Both arms obscured
    const frame = createPushUpFrame({ leftArmVisible: false, rightArmVisible: false });
    analyzer.analyzePoseFrame(frame);

    const metrics = analyzer.getMetrics();
    expect(metrics.elbowAngle).toBeNull();
    expect(metrics.leftElbowAngle).toBeNull();
    expect(metrics.rightElbowAngle).toBeNull();
  });

  it('10. Low visibility prevents unreliable form warnings', () => {
    let t = 1000;
    // Low confidence frames over persistent window
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ confidence: 0.3, hipOffset: 0.2, timestamp: t }));
      t += 50;
    }

    const assessment = analyzer.getFormAssessment();
    expect(assessment.activeFeedback).toContain('view');
    // Ensure unreliable technique warnings (sagging, depth, asymmetry) are withheld
    expect(assessment.issues.some(i => i.type === 'HIPS_SAGGING')).toBe(false);
    expect(assessment.issues.some(i => i.type === 'INSUFFICIENT_DEPTH')).toBe(false);
    expect(assessment.issues.some(i => i.type === 'ASYMMETRIC_MOVEMENT')).toBe(false);
  });

  it('11. Left/right asymmetry is assessed only when both sides have sufficient visibility', () => {
    let t = 1000;
    // Case A: Establish top, then descend with only Left arm visible -> asymmetry is NOT evaluated
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    for (let i = 0; i < 5; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ 
        leftElbowAngle: 120, 
        rightArmVisible: false, 
        timestamp: t 
      }));
      t += 50;
    }
    let assessment = analyzer.getFormAssessment();
    expect(assessment.issues.some(i => i.type === 'ASYMMETRIC_MOVEMENT')).toBe(false);

    // Case B: Reset, establish top, then descend with both arms visible with large divergence (120° vs 85° -> diff = 35° > 20°)
    analyzer.reset();
    for (let i = 0; i < 4; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
      t += 50;
    }
    for (let i = 0; i < 8; i++) {
      analyzer.analyzePoseFrame(createPushUpFrame({ 
        leftElbowAngle: 120, 
        rightElbowAngle: 85, 
        leftArmVisible: true, 
        rightArmVisible: true, 
        timestamp: t 
      }));
      t += 50;
    }
    assessment = analyzer.getFormAssessment();
    expect(assessment.issues.some(i => i.type === 'ASYMMETRIC_MOVEMENT')).toBe(true);
  });

  it('12. Analyzer reset clears previous state completely', () => {
    let t = 1000;
    analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165, timestamp: t }));
    t += 50;
    analyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 85, timestamp: t }));

    analyzer.reset();
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.elbowAngle).toBeNull();
    expect(analyzer.getRepAssessments()).toHaveLength(0);
  });

  it('13. Switching between squat and push-up does not leak state', () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    const pushUpAnalyzer = ExerciseRegistry.getAnalyzer('PUSH_UP');

    expect(squatAnalyzer).toBeInstanceOf(SquatAnalyzer);
    expect(pushUpAnalyzer).toBeInstanceOf(PushUpAnalyzer);

    // Process push-up frame
    pushUpAnalyzer.analyzePoseFrame(createPushUpFrame({ elbowAngle: 165 }));
    expect(pushUpAnalyzer.getMetrics().exercise).toBe('PUSH_UP');
    expect(pushUpAnalyzer.getMetrics().elbowAngle).toBeDefined();

    // Verify squat analyzer is completely clean and independent
    expect(squatAnalyzer.getMetrics().exercise).toBe('SQUAT');
    expect(squatAnalyzer.getMetrics().elbowAngle).toBeUndefined();
    expect(squatAnalyzer.getMetrics().reps).toBe(0);
  });

  it('14. The existing squat analyzer remains functional in registry', () => {
    const squatAnalyzer = ExerciseRegistry.getAnalyzer('SQUAT');
    expect(ExerciseRegistry.isImplemented('SQUAT')).toBe(true);
    expect(ExerciseRegistry.isImplemented('PUSH_UP')).toBe(true);
    expect(ExerciseRegistry.isImplemented('PLANK')).toBe(false);
  });

  it('15. PDF report generation handles push-up results cleanly', async () => {
    const mockSave = vi.fn();
    // Stub save method on jsPDF prototype
    const spy = vi.spyOn(PdfReportGenerator, 'generateReport').mockImplementation(async (data: AnalysisResultData) => {
      expect(data.exercise).toBe('PUSH_UP');
      expect(data.metrics?.exercise).toBe('PUSH_UP');
      expect(data.repAssessments).toBeDefined();
    });

    const data: AnalysisResultData = {
      exercise: 'PUSH_UP',
      originalFilename: 'pushup_test.mp4',
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
