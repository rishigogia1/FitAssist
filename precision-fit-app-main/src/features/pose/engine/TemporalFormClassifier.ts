import { FormIssueType } from '../types';
import { PoseFeatureVector } from './TemporalSequenceBuffer';

export type MLConfidenceState = 'HIGH' | 'UNCERTAIN' | 'MODEL_NOT_AVAILABLE';

export interface TemporalFormPrediction {
  status: MLConfidenceState;
  label?: FormIssueType | 'GOOD_FORM';
  confidence?: number;
  timestamp: number;
  modelVersion?: string;
  inferenceLatencyMs?: number;
}

export interface TemporalFormClassifier {
  initialize(): Promise<void>;
  predict(sequence: PoseFeatureVector[]): Promise<TemporalFormPrediction>;
  reset(): void;
  destroy(): void;
}

export const ML_CONFIG = {
  confidenceThreshold: 0.85,
  provider: 'NONE', // Can be 'SERVER' or 'LOCAL' once a model exists
  endpoint: '/api/v1/ml/predict-form' // Placeholder for future integration
};

/**
 * Null Object Implementation.
 * Because there is no .pth, .onnx, or TensorFlow model in the repository,
 * and no backend FastAPI route for inference, this explicit fallback ensures
 * we do not claim accuracy on fake weights.
 */
export class MissingModelClassifier implements TemporalFormClassifier {
  async initialize(): Promise<void> {
    // No-op
  }

  async predict(sequence: PoseFeatureVector[]): Promise<TemporalFormPrediction> {
    const start = performance.now();
    
    // Simulate slight network/inference delay for architecture testing
    await new Promise(resolve => setTimeout(resolve, 5));
    
    return {
      status: 'MODEL_NOT_AVAILABLE',
      timestamp: Date.now(),
      inferenceLatencyMs: performance.now() - start
    };
  }

  reset(): void {}
  destroy(): void {}
}
