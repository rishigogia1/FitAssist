import { 
  PoseFrame, 
  ExerciseMetrics, 
  ExerciseType,
  FormAssessment, 
  RepFormAssessment 
} from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { SquatFormAnalyzer } from './SquatFormAnalyzer';
import { calculateAngle } from '../utils/landmarkUtils';

// Constants for MediaPipe BlazePose landmarks
const LEFT_HIP = 23;
const LEFT_KNEE = 25;
const LEFT_ANKLE = 27;
const RIGHT_HIP = 24;
const RIGHT_KNEE = 26;
const RIGHT_ANKLE = 28;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export const SQUAT_CONFIG = {
  standingAngleThreshold: 160,
  descentAngleThreshold: 140, // Below this, eccentric phase starts
  bottomAngleThreshold: 90,   // Hysteresis for bottom phase
  depthThreshold: 100,        // Confirmed deep squat
  smoothingFactor: 0.3,       // Exponential moving average (0-1)
  confidenceThreshold: 0.5,
};

export class SquatAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType: ExerciseType = 'SQUAT';
  readonly isRepetitionBased: boolean = true;

  private metrics: ExerciseMetrics;
  private formAnalyzer: SquatFormAnalyzer;

  private smoothedLeftKnee = 180;
  private smoothedRightKnee = 180;
  private smoothedHip = 180;
  
  private topAngle = 180;
  private bottomAngle = 180;
  private repStartTime = 0;
  
  private standingBaseline = 180;

  constructor() {
    this.formAnalyzer = new SquatFormAnalyzer();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): ExerciseMetrics {
    return {
      exercise: 'SQUAT',
      phase: 'IDLE',
      reps: 0,
      currentRep: 0,
      holdDurationMs: null,
      holdDurationSec: null,
      kneeAngle: null,
      leftKneeAngle: null,
      rightKneeAngle: null,
      hipAngle: null,
      leftHipAngle: null,
      rightHipAngle: null,
      rangeOfMotion: null,
      depth: null,
      repDurationMs: null,
      confidence: 0,
      timestamp: 0,
    };
  }

  async initialize(): Promise<void> {
    this.reset();
  }

  reset(): void {
    this.metrics = this.getInitialMetrics();
    this.formAnalyzer.reset();
    this.smoothedLeftKnee = 180;
    this.smoothedRightKnee = 180;
    this.smoothedHip = 180;
    this.topAngle = 180;
    this.bottomAngle = 180;
    this.standingBaseline = 180;
    this.repStartTime = 0;
  }

  getMetrics(): ExerciseMetrics {
    return { ...this.metrics };
  }

  getFormAssessment(): FormAssessment {
    return this.formAnalyzer.getAssessment();
  }

  getRepAssessments(): RepFormAssessment[] {
    return this.formAnalyzer.getRepAssessments();
  }

  injectMLPrediction(prediction: any): void {
    this.formAnalyzer.injectMLPrediction(prediction);
  }

  analyzePoseFrame(frame: PoseFrame): void {
    this.metrics.timestamp = frame.timestamp;
    
    // 1. Check confidence
    if (frame.confidence < SQUAT_CONFIG.confidenceThreshold) {
      this.metrics.confidence = frame.confidence;
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }
    this.metrics.confidence = frame.confidence;

    const landmarks = frame.landmarks;
    
    // Ensure required landmarks exist
    if (!landmarks[LEFT_HIP] || !landmarks[LEFT_KNEE] || !landmarks[LEFT_ANKLE] ||
        !landmarks[RIGHT_HIP] || !landmarks[RIGHT_KNEE] || !landmarks[RIGHT_ANKLE]) {
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    // 2. Calculate angles
    const leftKneeRaw = calculateAngle(landmarks[LEFT_HIP], landmarks[LEFT_KNEE], landmarks[LEFT_ANKLE]);
    const rightKneeRaw = calculateAngle(landmarks[RIGHT_HIP], landmarks[RIGHT_KNEE], landmarks[RIGHT_ANKLE]);
    
    // Hip angle (Shoulder -> Hip -> Knee)
    const leftHipRaw = calculateAngle(landmarks[LEFT_SHOULDER], landmarks[LEFT_HIP], landmarks[LEFT_KNEE]);
    const rightHipRaw = calculateAngle(landmarks[RIGHT_SHOULDER], landmarks[RIGHT_HIP], landmarks[RIGHT_KNEE]);
    const avgHipRaw = (leftHipRaw + rightHipRaw) / 2;

    // 3. Temporal Smoothing (EMA)
    const alpha = SQUAT_CONFIG.smoothingFactor;
    this.smoothedLeftKnee = (alpha * leftKneeRaw) + ((1 - alpha) * this.smoothedLeftKnee);
    this.smoothedRightKnee = (alpha * rightKneeRaw) + ((1 - alpha) * this.smoothedRightKnee);
    this.smoothedHip = (alpha * avgHipRaw) + ((1 - alpha) * this.smoothedHip);

    const avgKneeAngle = (this.smoothedLeftKnee + this.smoothedRightKnee) / 2;
    
    this.metrics.leftKneeAngle = Math.round(this.smoothedLeftKnee);
    this.metrics.rightKneeAngle = Math.round(this.smoothedRightKnee);
    this.metrics.kneeAngle = Math.round(avgKneeAngle);
    this.metrics.hipAngle = Math.round(this.smoothedHip);
    this.metrics.leftHipAngle = Math.round(this.smoothedHip);
    this.metrics.rightHipAngle = Math.round(this.smoothedHip);

    // Baseline calibration (if standing relatively straight, update baseline slowly)
    if (avgKneeAngle > 165) {
      this.standingBaseline = (0.01 * avgKneeAngle) + (0.99 * this.standingBaseline);
    }

    // 4. State Machine
    this.processStateMachine(avgKneeAngle, frame.timestamp);
    
    // 5. Calculate continuous depth
    if (this.metrics.phase !== 'IDLE' && this.metrics.phase !== 'STANDING') {
      // Normalize depth: 0% = standingBaseline, 100% = depthThreshold
      const maxRange = Math.max(1, this.standingBaseline - SQUAT_CONFIG.depthThreshold);
      const currentDrop = this.standingBaseline - avgKneeAngle;
      let depthPercent = (currentDrop / maxRange) * 100;
      depthPercent = Math.max(0, Math.min(150, depthPercent)); // Cap at 150%
      this.metrics.depth = Math.round(depthPercent);
    } else {
      this.metrics.depth = 0;
    }

    // 6. Synchronize form analysis
    this.formAnalyzer.analyze(frame, this.metrics);
  }

  private processStateMachine(angle: number, timestamp: number) {
    const { standingAngleThreshold, descentAngleThreshold, bottomAngleThreshold } = SQUAT_CONFIG;
    
    switch (this.metrics.phase) {
      case 'IDLE':
        if (angle >= standingAngleThreshold) {
          this.metrics.phase = 'STANDING';
        }
        break;

      case 'STANDING':
        if (angle < descentAngleThreshold) {
          this.metrics.phase = 'ECCENTRIC';
          this.repStartTime = timestamp;
          this.topAngle = angle;
          this.bottomAngle = angle;
          this.metrics.currentRep = (this.metrics.reps ?? 0) + 1;
        }
        break;

      case 'ECCENTRIC':
        // Track lowest point
        if (angle < this.bottomAngle) {
          this.bottomAngle = angle;
        }
        
        if (angle <= bottomAngleThreshold) {
          this.metrics.phase = 'BOTTOM';
        } else if (angle >= standingAngleThreshold) {
          // Aborted rep
          this.metrics.phase = 'STANDING';
          this.metrics.currentRep = this.metrics.reps;
        }
        break;

      case 'BOTTOM':
        if (angle < this.bottomAngle) {
          this.bottomAngle = angle;
        }
        
        if (angle > bottomAngleThreshold + 10) {
          this.metrics.phase = 'CONCENTRIC';
        }
        break;

      case 'CONCENTRIC':
        if (angle >= standingAngleThreshold) {
          // Rep completed
          this.metrics.phase = 'STANDING';
          this.metrics.reps = (this.metrics.reps ?? 0) + 1;
          this.metrics.rangeOfMotion = Math.round(this.topAngle - this.bottomAngle);
          this.metrics.repDurationMs = timestamp - this.repStartTime;
        } else if (angle < this.bottomAngle - 10) {
           this.metrics.phase = 'ECCENTRIC';
        }
        break;
    }
  }

  destroy(): void {
    this.reset();
  }
}
