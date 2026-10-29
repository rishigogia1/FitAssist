import { describe, it, expect } from 'vitest';
import { TemporalSequenceBuffer, TEMPORAL_WINDOW_CONFIG } from './TemporalSequenceBuffer';
import { PoseFrame } from '../types';

describe('TemporalSequenceBuffer', () => {
  it('correctly tracks and bounds frames', () => {
    const buffer = new TemporalSequenceBuffer();
    
    // Push exactly the window size + 5
    for(let i=0; i<TEMPORAL_WINDOW_CONFIG.windowSize + 5; i++) {
      const frame: PoseFrame = {
        timestamp: i,
        confidence: 0.9,
        inferenceLatencyMs: 10,
        landmarks: new Array(33).fill({ x: 0, y: 0, z: 0, visibility: 1 })
      };
      buffer.push(frame);
    }
    
    const seq = buffer.getSequence();
    expect(seq.length).toBe(TEMPORAL_WINDOW_CONFIG.windowSize);
    // oldest 5 were shifted out, so it starts at timestamp 5
    expect(seq[0].timestamp).toBe(5); 
  });

  it('triggers readiness based on stride', () => {
    const buffer = new TemporalSequenceBuffer();
    let readyCount = 0;
    
    for(let i=1; i<=TEMPORAL_WINDOW_CONFIG.windowSize + TEMPORAL_WINDOW_CONFIG.stride * 3; i++) {
      const frame: PoseFrame = {
        timestamp: i,
        confidence: 0.9,
        inferenceLatencyMs: 10,
        landmarks: new Array(33).fill({ x: 0, y: 0, z: 0, visibility: 1 })
      };
      buffer.push(frame);
      if (buffer.isReady()) {
        readyCount++;
      }
    }
    
    // Ready count should be 3 (it fires every stride once full)
    expect(readyCount).toBe(4); // Wait, at i=30, 35, 40, 45 (4 times)
  });

  it('normalizes coordinates against hip center', () => {
    const buffer = new TemporalSequenceBuffer();
    
    const landmarks = new Array(33).fill({ x: 0, y: 0, z: 0, visibility: 1 });
    // Left Hip
    landmarks[23] = { x: 10, y: 50, z: 100, visibility: 1 };
    // Right Hip
    landmarks[24] = { x: 20, y: 50, z: 100, visibility: 1 };
    // Left Shoulder (Target index 11)
    landmarks[11] = { x: 15, y: 20, z: 90, visibility: 1 };

    const frame: PoseFrame = {
      timestamp: 100,
      confidence: 0.9,
      inferenceLatencyMs: 10,
      landmarks
    };

    buffer.push(frame);
    const seq = buffer.getSequence();
    
    // Hip origin = (15, 50, 100)
    // Left shoulder normalized = (15 - 15, 20 - 50, 90 - 100) = (0, -30, -10)
    
    // In our config, indices are: 11, 12, 23, 24, 25, 26, 27, 28
    // So target 11 is the first one in the feature list (indices 0, 1, 2)
    const features = seq[0].features;
    expect(features[0]).toBe(0); // x
    expect(features[1]).toBe(-30); // y
    expect(features[2]).toBe(-10); // z
  });

  it('maintains strict [30, 32] feature compatibility (pose-features-v1)', () => {
    const buffer = new TemporalSequenceBuffer();
    
    // Fill the window
    for(let i=0; i<30; i++) {
      const frame: PoseFrame = {
        timestamp: i,
        confidence: 0.9,
        inferenceLatencyMs: 10,
        landmarks: new Array(33).fill({ x: Math.random(), y: Math.random(), z: Math.random(), visibility: 1 })
      };
      buffer.push(frame);
    }
    
    const seq = buffer.getSequence();
    
    // Test Temporal length (30)
    expect(seq.length).toBe(30);
    
    // Test feature vector length per frame (8 landmarks * 4 fields = 32)
    seq.forEach(frameVector => {
      expect(frameVector.features.length).toBe(32);
      expect(frameVector.version).toBe('pose-features-v1');
    });
  });
});
