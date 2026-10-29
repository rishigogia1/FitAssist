import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SquatFormAnalyzer, SQUAT_FORM_CONFIG } from './SquatFormAnalyzer';
import { PoseFrame, ExerciseMetrics } from '../types';

describe('SquatFormAnalyzer', () => {
  let analyzer: SquatFormAnalyzer;
  
  beforeEach(() => {
    analyzer = new SquatFormAnalyzer();
  });

  function createMockFrame(confidence: number, timestamp: number = Date.now()): PoseFrame {
    return {
      timestamp,
      landmarks: [], // We don't actually use raw landmarks heavily in the simplified analyzer right now (relies on metrics mostly)
      confidence,
      inferenceLatencyMs: 10
    };
  }

  function createMockMetrics(overrides: Partial<ExerciseMetrics> = {}): ExerciseMetrics {
    return {
      exercise: 'SQUAT',
      phase: 'IDLE',
      reps: 0,
      currentRep: 0,
      kneeAngle: 180,
      leftKneeAngle: 180,
      rightKneeAngle: 180,
      hipAngle: 180,
      rangeOfMotion: 0,
      depth: 0,
      repDurationMs: 0,
      confidence: 1,
      timestamp: Date.now(),
      ...overrides
    };
  }

  it('initializes with 100 score and no issues', () => {
    const assessment = analyzer.getAssessment();
    expect(assessment.overallScore).toBe(100);
    expect(assessment.issues.length).toBe(0);
    expect(assessment.activeFeedback).toBeNull();
  });

  it('flags LOW_CONFIDENCE and suppresses other updates if confidence is too low', () => {
    const frame = createMockFrame(0.3);
    const metrics = createMockMetrics();
    
    // Process frames to trigger persistence
    for(let i=0; i<SQUAT_FORM_CONFIG.persistenceFrames; i++) {
      analyzer.analyze(frame, metrics);
    }

    const assessment = analyzer.getAssessment();
    expect(assessment.issues.find(i => i.type === 'LOW_CONFIDENCE')).toBeDefined();
    expect(assessment.activeFeedback).toContain('Move into clearer view');
  });

  it('detects ASYMMETRIC_MOVEMENT', () => {
    const frame = createMockFrame(0.9);
    const metrics = createMockMetrics({
      phase: 'ECCENTRIC',
      leftKneeAngle: 100,
      rightKneeAngle: 130 // 30 degrees diff > threshold (15)
    });

    for(let i=0; i<SQUAT_FORM_CONFIG.persistenceFrames; i++) {
      analyzer.analyze(frame, metrics);
    }

    const assessment = analyzer.getAssessment();
    expect(assessment.issues.find(i => i.type === 'ASYMMETRIC_MOVEMENT')).toBeDefined();
    expect(assessment.overallScore).toBeLessThan(100);
  });

  it('detects EXCESSIVE_FORWARD_LEAN', () => {
    const frame = createMockFrame(0.9);
    const metrics = createMockMetrics({
      phase: 'BOTTOM',
      hipAngle: 40 // < threshold (60)
    });

    for(let i=0; i<SQUAT_FORM_CONFIG.persistenceFrames; i++) {
      analyzer.analyze(frame, metrics);
    }

    const assessment = analyzer.getAssessment();
    expect(assessment.issues.find(i => i.type === 'EXCESSIVE_FORWARD_LEAN')).toBeDefined();
    expect(assessment.overallScore).toBeLessThan(100);
  });

  it('detects INSUFFICIENT_DEPTH at the end of a rep', () => {
    const startFrame = createMockFrame(0.9, 0);
    const eccentricMetrics = createMockMetrics({ phase: 'ECCENTRIC', depth: 10 });
    analyzer.analyze(startFrame, eccentricMetrics);

    // Never goes deep
    const bottomFrame = createMockFrame(0.9, 1000);
    const bottomMetrics = createMockMetrics({ phase: 'BOTTOM', depth: 40 }); // 40 < 80% threshold
    analyzer.analyze(bottomFrame, bottomMetrics);

    const endFrame = createMockFrame(0.9, 2000);
    const endMetrics = createMockMetrics({ phase: 'CONCENTRIC', depth: 10 });
    analyzer.analyze(endFrame, endMetrics);

    const finishFrame = createMockFrame(0.9, 2500);
    const finishMetrics = createMockMetrics({ phase: 'STANDING' });
    analyzer.analyze(finishFrame, finishMetrics);

    const repAssessments = analyzer.getRepAssessments();
    expect(repAssessments.length).toBe(1);
    expect(repAssessments[0].issues).toContain('INSUFFICIENT_DEPTH');
    expect(analyzer.getAssessment().activeFeedback).toContain('Try going a little deeper');
  });

  it('detects FAST_DESCENT at the end of a rep', () => {
    const eccentricMetrics = createMockMetrics({ phase: 'ECCENTRIC' });
    analyzer.analyze(createMockFrame(0.9, 0), eccentricMetrics);
    
    // Very fast descent (300ms < 800ms threshold)
    const bottomMetrics = createMockMetrics({ phase: 'BOTTOM' });
    analyzer.analyze(createMockFrame(0.9, 300), bottomMetrics);
    
    const concentricMetrics = createMockMetrics({ phase: 'CONCENTRIC' });
    analyzer.analyze(createMockFrame(0.9, 1000), concentricMetrics);
    
    const finishMetrics = createMockMetrics({ phase: 'STANDING' });
    analyzer.analyze(createMockFrame(0.9, 1500), finishMetrics);

    const repAssessments = analyzer.getRepAssessments();
    expect(repAssessments[0].issues).toContain('FAST_DESCENT');
    expect(analyzer.getAssessment().activeFeedback).toContain('slowing down');
  });

  it('provides positive feedback for a good rep', () => {
    analyzer.analyze(createMockFrame(0.9, 0), createMockMetrics({ phase: 'ECCENTRIC' }));
    
    // Slow enough, deep enough
    analyzer.analyze(createMockFrame(0.9, 1000), createMockMetrics({ phase: 'BOTTOM', depth: 95 }));
    
    // Controlled ascent
    analyzer.analyze(createMockFrame(0.9, 2000), createMockMetrics({ phase: 'CONCENTRIC', depth: 95 }));
    
    // Finish
    analyzer.analyze(createMockFrame(0.9, 3000), createMockMetrics({ phase: 'STANDING' }));

    const repAssessments = analyzer.getRepAssessments();
    expect(repAssessments[0].issues.length).toBe(0);
    expect(repAssessments[0].formScore).toBe(100);
    expect(analyzer.getAssessment().activeFeedback).toContain('Good rep');
  });
});
