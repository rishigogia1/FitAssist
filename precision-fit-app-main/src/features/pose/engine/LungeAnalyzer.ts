import { 
  PoseFrame, 
  ExerciseMetrics, 
  ExerciseType, 
  FormAssessment, 
  RepFormAssessment, 
  PoseLandmark 
} from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { LungeFormAnalyzer, LUNGE_FORM_CONFIG } from './LungeFormAnalyzer';
import { calculateAngle } from '../utils/landmarkUtils';

// BlazePose Landmark Indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export const LUNGE_CONFIG = {
  // Angular Thresholds (degrees)
  standingAngleThreshold: 155,       // Standing neutral position (knees >= 155°)
  descentAngleThreshold: 145,        // Flexion begins (front knee < 145°)
  bottomAngleThreshold: 100,         // Valid lunge depth (front knee <= 100°)
  hysteresis: 8,                     // Guard against boundary flickering
  
  // Stance & Leg Separation
  stanceWidthThreshold: 0.08,        // Normalized X distance to distinguish front/rear legs
  
  // Timing & Smoothing
  smoothingFactor: 0.35,             // Exponential Moving Average alpha
  minRepDurationMs: 500,             // Minimum cycle duration to prevent noise counts
  confidenceThreshold: 0.5,          // Minimum joint visibility required
};

/**
 * Lunge pose analyzer implementing the shared ExerciseAnalyzer contract.
 * Tracks front/rear leg angles, active leg identity, movement depth, torso posture, and repetition cycles.
 */
export class LungeAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType: ExerciseType = 'LUNGE';
  readonly isRepetitionBased: boolean = true;

  private metrics: ExerciseMetrics;
  private formAnalyzer: LungeFormAnalyzer;

  // Smoothed joint state
  private smoothedLeftKnee = 170;
  private smoothedRightKnee = 170;
  private smoothedTorsoAngle = 180;
  private standingBaseline = 170;

  // Repetition extrema & timers
  private minAngleInRep = 180;
  private maxAngleInRep = 170;
  private repStartTime = 0;
  private hasReachedBottom = false;

  constructor() {
    this.formAnalyzer = new LungeFormAnalyzer();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): ExerciseMetrics {
    return {
      exercise: 'LUNGE',
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
      elbowAngle: null,
      leftElbowAngle: null,
      rightElbowAngle: null,
      spineAngle: null,
      frontKneeAngle: null,
      rearKneeAngle: null,
      activeLeg: 'UNKNOWN',
      torsoAngle: null,
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
    this.smoothedLeftKnee = 170;
    this.smoothedRightKnee = 170;
    this.smoothedTorsoAngle = 180;
    this.standingBaseline = 170;
    this.minAngleInRep = 180;
    this.maxAngleInRep = 170;
    this.repStartTime = 0;
    this.hasReachedBottom = false;
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

  analyzePoseFrame(frame: PoseFrame): void {
    this.metrics.timestamp = frame.timestamp;
    this.metrics.confidence = frame.confidence;

    // 1. Confidence check
    if (frame.confidence < LUNGE_CONFIG.confidenceThreshold) {
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    const landmarks = frame.landmarks;
    if (!landmarks || landmarks.length < 33) {
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    // 2. Determine leg joint visibility
    const leftLegVisible = this.isJointGroupVisible(landmarks, [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE]);
    const rightLegVisible = this.isJointGroupVisible(landmarks, [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE]);

    if (!leftLegVisible && !rightLegVisible) {
      this.metrics.kneeAngle = null;
      this.metrics.leftKneeAngle = null;
      this.metrics.rightKneeAngle = null;
      this.metrics.frontKneeAngle = null;
      this.metrics.rearKneeAngle = null;
      this.metrics.activeLeg = 'UNKNOWN';
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    const alpha = LUNGE_CONFIG.smoothingFactor;
    let leftAngle: number | null = null;
    let rightAngle: number | null = null;

    if (leftLegVisible) {
      const rawLeft = calculateAngle(landmarks[LEFT_HIP], landmarks[LEFT_KNEE], landmarks[LEFT_ANKLE]);
      this.smoothedLeftKnee = (alpha * rawLeft) + ((1 - alpha) * this.smoothedLeftKnee);
      leftAngle = Math.round(this.smoothedLeftKnee);
    } else {
      this.metrics.leftKneeAngle = null;
    }

    if (rightLegVisible) {
      const rawRight = calculateAngle(landmarks[RIGHT_HIP], landmarks[RIGHT_KNEE], landmarks[RIGHT_ANKLE]);
      this.smoothedRightKnee = (alpha * rawRight) + ((1 - alpha) * this.smoothedRightKnee);
      rightAngle = Math.round(this.smoothedRightKnee);
    } else {
      this.metrics.rightKneeAngle = null;
    }

    this.metrics.leftKneeAngle = leftAngle;
    this.metrics.rightKneeAngle = rightAngle;

    // 3. Identify Active / Front Leg (if both legs are reliably visible and stance is split)
    let activeLeg: 'LEFT' | 'RIGHT' | 'UNKNOWN' = 'UNKNOWN';
    let frontAngle: number | null = null;
    let rearAngle: number | null = null;
    let isKneeAsymmetric = false;

    if (leftLegVisible && rightLegVisible && leftAngle !== null && rightAngle !== null) {
      const stanceWidth = Math.abs(landmarks[LEFT_ANKLE].x - landmarks[RIGHT_ANKLE].x);
      const hipMidX = (landmarks[LEFT_HIP].x + landmarks[RIGHT_HIP].x) / 2;
      const leftDisp = Math.abs(landmarks[LEFT_ANKLE].x - hipMidX);
      const rightDisp = Math.abs(landmarks[RIGHT_ANKLE].x - hipMidX);

      // Distinguish front leg only when stance split is pronounced
      if (stanceWidth >= LUNGE_CONFIG.stanceWidthThreshold && Math.abs(leftDisp - rightDisp) > 0.03) {
        if (leftDisp > rightDisp) {
          activeLeg = 'LEFT';
          frontAngle = leftAngle;
          rearAngle = rightAngle;
        } else {
          activeLeg = 'RIGHT';
          frontAngle = rightAngle;
          rearAngle = leftAngle;
        }
      } else {
        // Stance width too narrow or legs equal distance from hips
        activeLeg = 'UNKNOWN';
      }

      // Check knee angle asymmetry between legs when in deep lunge
      if (Math.abs(leftAngle - rightAngle) > LUNGE_FORM_CONFIG.kneeAsymmetryThresholdDegrees) {
        isKneeAsymmetric = true;
      }
    }

    this.metrics.activeLeg = activeLeg;
    this.metrics.frontKneeAngle = frontAngle;
    this.metrics.rearKneeAngle = rearAngle;

    // Primary knee angle for movement tracking: front leg if identified, else the more flexed knee
    const primaryKneeAngle = frontAngle ?? (leftAngle !== null && rightAngle !== null 
      ? Math.min(leftAngle, rightAngle) 
      : (leftAngle ?? rightAngle ?? 170));

    this.metrics.kneeAngle = primaryKneeAngle;

    // 4. Torso Lean Evaluation (Shoulder -> Hip -> Knee)
    let isTorsoLeaning = false;
    const shoulderIdx = leftLegVisible ? LEFT_SHOULDER : RIGHT_SHOULDER;
    const hipIdx = leftLegVisible ? LEFT_HIP : RIGHT_HIP;
    const kneeIdx = leftLegVisible ? LEFT_KNEE : RIGHT_KNEE;

    if (landmarks[shoulderIdx] && landmarks[hipIdx] && landmarks[kneeIdx] &&
        landmarks[shoulderIdx].visibility >= LUNGE_CONFIG.confidenceThreshold) {
      const rawTorso = calculateAngle(landmarks[shoulderIdx], landmarks[hipIdx], landmarks[kneeIdx]);
      this.smoothedTorsoAngle = (0.2 * rawTorso) + (0.8 * this.smoothedTorsoAngle);
      const roundedTorso = Math.round(this.smoothedTorsoAngle);
      this.metrics.torsoAngle = roundedTorso;
      this.metrics.hipAngle = roundedTorso;

      if (roundedTorso < LUNGE_FORM_CONFIG.torsoLeanThresholdDegrees) {
        isTorsoLeaning = true;
      }
    }

    // Adapt standing baseline in neutral standing pose
    if (primaryKneeAngle >= LUNGE_CONFIG.standingAngleThreshold) {
      this.standingBaseline = (0.01 * primaryKneeAngle) + (0.99 * this.standingBaseline);
    }

    // 5. State Machine for Lunge Movement
    this.processStateMachine(primaryKneeAngle, frame.timestamp);

    // 6. Continuous Depth Metric (0% to 100%+)
    if (this.metrics.phase !== 'IDLE' && this.metrics.phase !== 'STANDING') {
      const maxRange = Math.max(1, this.standingBaseline - 90); // 90° target bottom
      const currentDrop = this.standingBaseline - primaryKneeAngle;
      const depthPercent = Math.round((currentDrop / maxRange) * 100);
      this.metrics.depth = Math.max(0, Math.min(150, depthPercent));
    } else {
      this.metrics.depth = 0;
    }

    // 7. Synchronize Form Assessment
    this.formAnalyzer.analyze(frame, this.metrics, {
      isTorsoLeaning,
      isKneeAsymmetric,
      activeLegIdentified: activeLeg !== 'UNKNOWN'
    });
  }

  private isJointGroupVisible(landmarks: PoseLandmark[], indices: number[]): boolean {
    return indices.every(idx => {
      const lm = landmarks[idx];
      return lm && lm.visibility >= LUNGE_CONFIG.confidenceThreshold;
    });
  }

  /**
   * State Machine: IDLE -> STANDING -> ECCENTRIC -> BOTTOM -> CONCENTRIC -> STANDING
   */
  private processStateMachine(angle: number, timestamp: number): void {
    const { 
      standingAngleThreshold, 
      descentAngleThreshold, 
      bottomAngleThreshold, 
      hysteresis, 
      minRepDurationMs 
    } = LUNGE_CONFIG;

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
          this.minAngleInRep = angle;
          this.maxAngleInRep = Math.max(angle, this.standingBaseline);
          this.hasReachedBottom = false;
          this.metrics.currentRep = (this.metrics.reps ?? 0) + 1;
        }
        break;

      case 'ECCENTRIC':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        // Reached valid bottom depth
        if (angle <= bottomAngleThreshold) {
          this.hasReachedBottom = true;
          this.metrics.phase = 'BOTTOM';
        } else if (angle >= standingAngleThreshold) {
          // Aborted repetition without reaching bottom
          this.metrics.phase = 'STANDING';
          this.metrics.currentRep = this.metrics.reps;
        }
        break;

      case 'BOTTOM':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        // Ascent with hysteresis guard
        if (angle > bottomAngleThreshold + hysteresis) {
          this.metrics.phase = 'CONCENTRIC';
          this.maxAngleInRep = angle;
        }
        break;

      case 'CONCENTRIC':
        if (angle > this.maxAngleInRep) {
          this.maxAngleInRep = angle;
        }

        // Completed return to standing position
        if (angle >= standingAngleThreshold) {
          const duration = timestamp - this.repStartTime;

          // Only count repetition if bottom depth was achieved and duration meets minimum
          if (this.hasReachedBottom && duration >= minRepDurationMs) {
            this.metrics.reps = (this.metrics.reps ?? 0) + 1;
            this.metrics.rangeOfMotion = Math.round(this.maxAngleInRep - this.minAngleInRep);
            this.metrics.repDurationMs = duration;
          }

          this.metrics.phase = 'STANDING';
          this.metrics.currentRep = this.metrics.reps;
          this.hasReachedBottom = false;
        } else if (angle < this.maxAngleInRep - hysteresis) {
          // Reversed direction back downward before reaching top
          this.metrics.phase = 'ECCENTRIC';
        }
        break;
    }
  }

  destroy(): void {
    this.reset();
  }
}
