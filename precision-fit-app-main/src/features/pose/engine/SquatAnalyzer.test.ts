import { describe, it, expect, beforeEach } from 'vitest';
import { SquatAnalyzer, SQUAT_CONFIG } from './SquatAnalyzer';
import { PoseFrame } from '../types';

function createMockFrame(kneeAngle: number, hipAngle = 180): PoseFrame {
  // We mock just enough of the geometry for the distance/angle calculations to work
  // calculateAngle uses atan2, so we can mock landmarks in 2D space.
  // For a knee angle of X degrees:
  // Hip = (0, 0)
  // Knee = (0, -1)
  // Ankle = (sin(X), -1 - cos(X))
  // This is a rough approximation, but since calculateAngle works on raw coordinates, 
  // it's easier to mock the coordinates directly to yield the exact angle.
  
  const radians = (kneeAngle * Math.PI) / 180;
  
  const hip = { id: 23, x: 0, y: 0, z: 0, visibility: 1 };
  const knee = { id: 25, x: 0, y: 1, z: 0, visibility: 1 };
  const ankle = { id: 27, x: Math.sin(radians), y: 1 - Math.cos(radians), z: 0, visibility: 1 };
  
  const shoulder = { id: 11, x: 0, y: -1, z: 0, visibility: 1 }; // Hip angle 180 by default

  const landmarks: any[] = Array(33).fill({ x: 0, y: 0, z: 0, visibility: 0 });
  landmarks[23] = hip; // LEFT_HIP
  landmarks[24] = hip; // RIGHT_HIP
  landmarks[25] = knee; // LEFT_KNEE
  landmarks[26] = knee; // RIGHT_KNEE
  landmarks[27] = ankle; // LEFT_ANKLE
  landmarks[28] = ankle; // RIGHT_ANKLE
  landmarks[11] = shoulder; // LEFT_SHOULDER
  landmarks[12] = shoulder; // RIGHT_SHOULDER

  return {
    timestamp: Date.now(),
    landmarks,
    confidence: 0.9,
    inferenceLatencyMs: 10
  };
}

describe('SquatAnalyzer', () => {
  let analyzer: SquatAnalyzer;

  beforeEach(() => {
    analyzer = new SquatAnalyzer();
  });

  it('initializes with IDLE phase and 0 reps', () => {
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('IDLE');
    expect(metrics.reps).toBe(0);
    expect(metrics.exercise).toBe('SQUAT');
  });

  it('handles low confidence frames safely', () => {
    const frame = createMockFrame(180);
    frame.confidence = 0.2; // below threshold
    analyzer.analyzePoseFrame(frame);
    
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('IDLE'); // Should not have advanced
    expect(metrics.confidence).toBe(0.2);
  });

  it('detects STANDING phase from IDLE', () => {
    // We send multiple frames to overcome the EMA smoothing
    for (let i = 0; i < 10; i++) {
      analyzer.analyzePoseFrame(createMockFrame(175));
    }
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('STANDING');
  });

  it('detects full rep correctly', () => {
    // 1. Stand
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(180));
    expect(analyzer.getMetrics().phase).toBe('STANDING');
    
    // 2. Descend (Eccentric)
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(130));
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');
    
    // 3. Bottom
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(85));
    expect(analyzer.getMetrics().phase).toBe('BOTTOM');
    expect(analyzer.getMetrics().depth).toBeGreaterThan(0);
    
    // 4. Ascend (Concentric)
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(130));
    expect(analyzer.getMetrics().phase).toBe('CONCENTRIC');
    
    // 5. Stand again
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(175));
    
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.reps).toBe(1);
  });

  it('does not count incomplete reps', () => {
    // 1. Stand
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(180));
    
    // 2. Descend partially (Quarter squat)
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(130));
    expect(analyzer.getMetrics().phase).toBe('ECCENTRIC');
    
    // 3. Stand again without hitting bottom
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(180));
    
    const metrics = analyzer.getMetrics();
    expect(metrics.phase).toBe('STANDING');
    expect(metrics.reps).toBe(0); // Rep was aborted
  });

  it('can be reset', () => {
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(180));
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(130));
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(80));
    for (let i = 0; i < 10; i++) analyzer.analyzePoseFrame(createMockFrame(180));
    
    expect(analyzer.getMetrics().reps).toBe(1);
    
    analyzer.reset();
    const metrics = analyzer.getMetrics();
    expect(metrics.reps).toBe(0);
    expect(metrics.phase).toBe('IDLE');
  });
});
