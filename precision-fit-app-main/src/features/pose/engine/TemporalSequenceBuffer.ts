import { PoseFrame } from '../types';

export interface PoseFeatureVector {
  version: string;
  timestamp: number;
  features: number[]; // Flattened normalized array of [x, y, z, visibility]
}

export const TEMPORAL_WINDOW_CONFIG = {
  windowSize: 30, // 30 frames = 1 second at 30fps
  stride: 5, // Run inference every 5 frames once buffer is full
  featureVersion: "pose-features-v1",
  targetLandmarkIndices: [
    11, // LEFT_SHOULDER
    12, // RIGHT_SHOULDER
    23, // LEFT_HIP
    24, // RIGHT_HIP
    25, // LEFT_KNEE
    26, // RIGHT_KNEE
    27, // LEFT_ANKLE
    28, // RIGHT_ANKLE
  ]
};

export class TemporalSequenceBuffer {
  private buffer: PoseFeatureVector[] = [];
  private frameCounter = 0;

  push(frame: PoseFrame): void {
    const vector = this.extractFeatures(frame);
    if (!vector) return; // Skip invalid frames

    this.buffer.push(vector);
    
    // Keep bounded
    if (this.buffer.length > TEMPORAL_WINDOW_CONFIG.windowSize) {
      this.buffer.shift();
    }
    
    this.frameCounter++;
  }

  isReady(): boolean {
    return this.buffer.length === TEMPORAL_WINDOW_CONFIG.windowSize && 
           this.frameCounter % TEMPORAL_WINDOW_CONFIG.stride === 0;
  }

  getSequence(): PoseFeatureVector[] {
    return [...this.buffer];
  }

  reset(): void {
    this.buffer = [];
    this.frameCounter = 0;
  }

  private extractFeatures(frame: PoseFrame): PoseFeatureVector | null {
    if (!frame.landmarks || frame.landmarks.length === 0) return null;

    const features: number[] = [];
    
    // Normalize coordinates relative to the hip center to provide translation invariance
    const leftHip = frame.landmarks[23];
    const rightHip = frame.landmarks[24];
    
    if (!leftHip || !rightHip) return null;
    
    const originX = (leftHip.x + rightHip.x) / 2;
    const originY = (leftHip.y + rightHip.y) / 2;
    const originZ = (leftHip.z + rightHip.z) / 2;

    for (const index of TEMPORAL_WINDOW_CONFIG.targetLandmarkIndices) {
      const lm = frame.landmarks[index];
      if (lm) {
        features.push(
          lm.x - originX,
          lm.y - originY,
          lm.z - originZ,
          lm.visibility || 0
        );
      } else {
        features.push(0, 0, 0, 0);
      }
    }

    return {
      version: TEMPORAL_WINDOW_CONFIG.featureVersion,
      timestamp: frame.timestamp,
      features
    };
  }
}
