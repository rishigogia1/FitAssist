import { 
  PoseFrame, 
  ExerciseMetrics, 
  ExerciseType, 
  FormAssessment, 
  RepFormAssessment, 
  PoseLandmark 
} from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { PushUpFormAnalyzer, PUSH_UP_FORM_CONFIG } from './PushUpFormAnalyzer';
import { calculateAngle } from '../utils/landmarkUtils';

// BlazePose Landmark Indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export const PUSH_UP_CONFIG = {
  // Movement Angle Thresholds (degrees)
  topAngleThreshold: 155,        // Top/lockout position (> 155°)
  descentAngleThreshold: 140,    // Flexion begins below this angle (< 140°)
  bottomAngleThreshold: 95,      // Valid bottom depth (chest near floor, elbows <= 95°)
  hysteresis: 8,                 // Buffer to prevent boundary oscillation
  
  // Alignment & Asymmetry (degrees)
  hipAlignmentThreshold: 155,    // Sagging/piking threshold
  hipOffsetTolerance: 0.04,      // Y-axis normalized displacement threshold
  asymmetryThreshold: 20,        // Max acceptable difference between arms
  
  // Timing & Smoothing
  smoothingFactor: 0.35,         // EMA alpha for angle smoothing
  minRepDurationMs: 400,         // Minimum duration for a valid rep cycle
  confidenceThreshold: 0.5,      // Minimum landmark visibility required
};

export class PushUpAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType: ExerciseType = 'PUSH_UP';
  readonly isRepetitionBased: boolean = true;

  private metrics: ExerciseMetrics;
  private formAnalyzer: PushUpFormAnalyzer;

  // Smoothed kinematic state
  private smoothedLeftElbow = 160;
  private smoothedRightElbow = 160;
  private smoothedHipAngle = 180;
  private topBaseline = 160;

  // Rep tracking state
  private minAngleInRep = 180;
  private maxAngleInRep = 160;
  private repStartTime = 0;
  private hasReachedBottom = false;

  constructor() {
    this.formAnalyzer = new PushUpFormAnalyzer();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): ExerciseMetrics {
    return {
      exercise: 'PUSH_UP',
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
    this.smoothedLeftElbow = 160;
    this.smoothedRightElbow = 160;
    this.smoothedHipAngle = 180;
    this.topBaseline = 160;
    this.minAngleInRep = 180;
    this.maxAngleInRep = 160;
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

    // 1. Overall Confidence Check
    if (frame.confidence < PUSH_UP_CONFIG.confidenceThreshold) {
      this.formAnalyzer.analyze(frame, this.metrics, { isBothArmsVisible: false });
      return;
    }

    const landmarks = frame.landmarks;
    if (!landmarks || landmarks.length < 33) {
      this.formAnalyzer.analyze(frame, this.metrics, { isBothArmsVisible: false });
      return;
    }

    // 2. Assess Arm Visibility on Left and Right sides
    const leftArmVisible = this.isJointGroupVisible(landmarks, [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST]);
    const rightArmVisible = this.isJointGroupVisible(landmarks, [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]);

    // If neither arm is reliably visible, withhold angle output
    if (!leftArmVisible && !rightArmVisible) {
      this.metrics.elbowAngle = null;
      this.metrics.leftElbowAngle = null;
      this.metrics.rightElbowAngle = null;
      this.formAnalyzer.analyze(frame, this.metrics, { isBothArmsVisible: false });
      return;
    }

    // 3. Compute Elbow Angles for visible sides
    let leftAngle: number | null = null;
    let rightAngle: number | null = null;
    let primaryElbowAngle: number;
    let leftRightDiff: number | null = null;

    const alpha = PUSH_UP_CONFIG.smoothingFactor;

    if (leftArmVisible && rightArmVisible) {
      const rawLeft = calculateAngle(landmarks[LEFT_SHOULDER], landmarks[LEFT_ELBOW], landmarks[LEFT_WRIST]);
      const rawRight = calculateAngle(landmarks[RIGHT_SHOULDER], landmarks[RIGHT_ELBOW], landmarks[RIGHT_WRIST]);

      this.smoothedLeftElbow = (alpha * rawLeft) + ((1 - alpha) * this.smoothedLeftElbow);
      this.smoothedRightElbow = (alpha * rawRight) + ((1 - alpha) * this.smoothedRightElbow);

      leftAngle = Math.round(this.smoothedLeftElbow);
      rightAngle = Math.round(this.smoothedRightElbow);
      primaryElbowAngle = (this.smoothedLeftElbow + this.smoothedRightElbow) / 2;
      leftRightDiff = Math.abs(leftAngle - rightAngle);
    } else if (leftArmVisible) {
      const rawLeft = calculateAngle(landmarks[LEFT_SHOULDER], landmarks[LEFT_ELBOW], landmarks[LEFT_WRIST]);
      this.smoothedLeftElbow = (alpha * rawLeft) + ((1 - alpha) * this.smoothedLeftElbow);
      leftAngle = Math.round(this.smoothedLeftElbow);
      primaryElbowAngle = this.smoothedLeftElbow;
    } else {
      const rawRight = calculateAngle(landmarks[RIGHT_SHOULDER], landmarks[RIGHT_ELBOW], landmarks[RIGHT_WRIST]);
      this.smoothedRightElbow = (alpha * rawRight) + ((1 - alpha) * this.smoothedRightElbow);
      rightAngle = Math.round(this.smoothedRightElbow);
      primaryElbowAngle = this.smoothedRightElbow;
    }

    const roundedPrimaryAngle = Math.round(primaryElbowAngle);
    this.metrics.elbowAngle = roundedPrimaryAngle;
    this.metrics.leftElbowAngle = leftAngle;
    this.metrics.rightElbowAngle = rightAngle;

    // 4. Assess Body Alignment (Shoulder - Hip - Ankle)
    const { hipAngle, isSagging, isPiking } = this.calculateBodyAlignment(landmarks, leftArmVisible, rightArmVisible);
    this.metrics.hipAngle = hipAngle;

    // Adapt top baseline gradually when locked out in plank
    if (roundedPrimaryAngle >= PUSH_UP_CONFIG.topAngleThreshold) {
      this.topBaseline = (0.01 * roundedPrimaryAngle) + (0.99 * this.topBaseline);
    }

    // 5. State Machine for Movement Phases & Rep Counting
    this.processStateMachine(roundedPrimaryAngle, frame.timestamp);

    // 6. Continuous Depth Calculation (0% to 100%+)
    if (this.metrics.phase !== 'IDLE' && this.metrics.phase !== 'TOP' && this.metrics.phase !== 'STANDING') {
      const travelRange = Math.max(1, this.topBaseline - PUSH_UP_CONFIG.bottomAngleThreshold);
      const currentTravel = this.topBaseline - roundedPrimaryAngle;
      const depthPercent = Math.round((currentTravel / travelRange) * 100);
      this.metrics.depth = Math.max(0, Math.min(150, depthPercent));
    } else {
      this.metrics.depth = 0;
    }

    // 7. Form Assessment Synchronization
    this.formAnalyzer.analyze(frame, this.metrics, {
      isSagging,
      isPiking,
      leftRightDiff,
      isBothArmsVisible: leftArmVisible && rightArmVisible,
    });
  }

  /**
   * Helper to check if all landmarks in an identifier group meet visibility requirements.
   */
  private isJointGroupVisible(landmarks: PoseLandmark[], indices: number[]): boolean {
    return indices.every(idx => {
      const lm = landmarks[idx];
      return lm && lm.visibility >= PUSH_UP_CONFIG.confidenceThreshold;
    });
  }

  /**
   * Evaluates torso-to-leg body alignment to observe sagging or piking.
   */
  private calculateBodyAlignment(
    landmarks: PoseLandmark[], 
    leftArmVisible: boolean, 
    rightArmVisible: boolean
  ): { hipAngle: number | null; isSagging: boolean; isPiking: boolean } {
    let s: PoseLandmark | null = null;
    let h: PoseLandmark | null = null;
    let a: PoseLandmark | null = null;

    const leftBodyVisible = this.isJointGroupVisible(landmarks, [LEFT_SHOULDER, LEFT_HIP, LEFT_ANKLE]);
    const rightBodyVisible = this.isJointGroupVisible(landmarks, [RIGHT_SHOULDER, RIGHT_HIP, RIGHT_ANKLE]);

    if (leftBodyVisible && rightBodyVisible) {
      // Both visible - pick the more visible arm side or average
      if (leftArmVisible && !rightArmVisible) {
        s = landmarks[LEFT_SHOULDER]; h = landmarks[LEFT_HIP]; a = landmarks[LEFT_ANKLE];
      } else {
        s = landmarks[RIGHT_SHOULDER]; h = landmarks[RIGHT_HIP]; a = landmarks[RIGHT_ANKLE];
      }
    } else if (leftBodyVisible) {
      s = landmarks[LEFT_SHOULDER]; h = landmarks[LEFT_HIP]; a = landmarks[LEFT_ANKLE];
    } else if (rightBodyVisible) {
      s = landmarks[RIGHT_SHOULDER]; h = landmarks[RIGHT_HIP]; a = landmarks[RIGHT_ANKLE];
    }

    if (!s || !h || !a) {
      return { hipAngle: null, isSagging: false, isPiking: false };
    }

    const rawAngle = calculateAngle(s, h, a);
    this.smoothedHipAngle = (0.2 * rawAngle) + (0.8 * this.smoothedHipAngle);
    const angle = Math.round(this.smoothedHipAngle);

    // Compute vertical displacement of hip relative to midpoint between shoulder and ankle
    // Note: in standard normalized coordinates, y increases downward toward the floor.
    const midY = (s.y + a.y) / 2;
    const dy = h.y - midY;

    const isDeviating = angle < PUSH_UP_CONFIG.hipAlignmentThreshold;
    const isSagging = isDeviating && dy > PUSH_UP_CONFIG.hipOffsetTolerance;
    const isPiking = isDeviating && dy < -PUSH_UP_CONFIG.hipOffsetTolerance;

    return { hipAngle: angle, isSagging, isPiking };
  }

  /**
   * State Machine tracking: IDLE -> TOP -> ECCENTRIC -> BOTTOM -> CONCENTRIC -> TOP
   */
  private processStateMachine(angle: number, timestamp: number): void {
    const { 
      topAngleThreshold, 
      descentAngleThreshold, 
      bottomAngleThreshold, 
      hysteresis, 
      minRepDurationMs 
    } = PUSH_UP_CONFIG;

    switch (this.metrics.phase) {
      case 'IDLE':
      case 'STANDING': // Accepts STANDING as initial plank position for compatibility
        if (angle >= topAngleThreshold) {
          this.metrics.phase = 'TOP';
        }
        break;

      case 'TOP':
        // Detect initiation of descent
        if (angle < descentAngleThreshold) {
          this.metrics.phase = 'ECCENTRIC';
          this.repStartTime = timestamp;
          this.minAngleInRep = angle;
          this.maxAngleInRep = Math.max(angle, this.topBaseline);
          this.hasReachedBottom = false;
          this.metrics.currentRep = (this.metrics.reps ?? 0) + 1;
        }
        break;

      case 'ECCENTRIC':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        // Reached bottom depth
        if (angle <= bottomAngleThreshold) {
          this.hasReachedBottom = true;
          this.metrics.phase = 'BOTTOM';
        } else if (angle >= topAngleThreshold) {
          // Aborted movement before reaching bottom
          this.metrics.phase = 'TOP';
          this.metrics.currentRep = this.metrics.reps;
        }
        break;

      case 'BOTTOM':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        // Ascent with hysteresis to prevent bouncing
        if (angle > bottomAngleThreshold + hysteresis) {
          this.metrics.phase = 'CONCENTRIC';
          this.maxAngleInRep = angle;
        }
        break;

      case 'CONCENTRIC':
        if (angle > this.maxAngleInRep) {
          this.maxAngleInRep = angle;
        }

        // Completed return to top lockout position
        if (angle >= topAngleThreshold) {
          const duration = timestamp - this.repStartTime;

          // Only count repetition if proper depth was confirmed and duration is reasonable
          if (this.hasReachedBottom && duration >= minRepDurationMs) {
            this.metrics.reps = (this.metrics.reps ?? 0) + 1;
            this.metrics.rangeOfMotion = Math.round(this.maxAngleInRep - this.minAngleInRep);
            this.metrics.repDurationMs = duration;
          }

          this.metrics.phase = 'TOP';
          this.metrics.currentRep = this.metrics.reps;
          this.hasReachedBottom = false;
        } else if (angle < this.maxAngleInRep - hysteresis) {
          // Reversed direction back downward
          this.metrics.phase = 'ECCENTRIC';
        }
        break;
    }
  }

  destroy(): void {
    this.reset();
  }
}
