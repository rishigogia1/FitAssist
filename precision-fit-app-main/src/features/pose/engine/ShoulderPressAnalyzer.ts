import {
  PoseFrame,
  PoseLandmark,
  ExerciseMetrics,
  FormAssessment,
  RepFormAssessment
} from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { calculateAngle } from '../utils/landmarkUtils';
import { ShoulderPressFormAnalyzer } from './ShoulderPressFormAnalyzer';
import { calculateNormalizedROM } from './MovementRangeNormalizer';

// Landmark IDs from MediaPipe Pose
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

export const SHOULDER_PRESS_CONFIG = {
  confidenceThreshold: 0.5,
  rackAngleThreshold: 105,       // Elbow angle at shoulder height starting position
  concentricThreshold: 115,     // Upward press initiation threshold
  overheadLockoutThreshold: 145,// Arms extended overhead
  returnThreshold: 110,         // Arms lowered back to shoulder height
  targetLockoutDegrees: 160,    // Target peak for 100% normalized ROM
  minRepDurationMs: 400,        // Minimum rep duration guard
  alphaSmoothing: 0.45,
};

export class ShoulderPressAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType = 'SHOULDER_PRESS';
  readonly isRepetitionBased = true;
  private metrics: ExerciseMetrics;
  private formAnalyzer: ShoulderPressFormAnalyzer;

  // Smoothed angles
  private smoothedLeftElbow = 85;
  private smoothedRightElbow = 85;
  private smoothedShoulderElevation = 85;
  private startBaseline = 85;

  // Repetition extrema & timing
  private repStartTime = 0;
  private minAngleInRep = 180;
  private maxAngleInRep = 0;

  constructor() {
    this.formAnalyzer = new ShoulderPressFormAnalyzer();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): ExerciseMetrics {
    return {
      exercise: 'SHOULDER_PRESS',
      phase: 'IDLE',
      reps: 0,
      currentRep: 0,
      holdDurationMs: null,
      holdDurationSec: null,
      kneeAngle: null,
      leftKneeAngle: null,
      rightKneeAngle: null,
      hipAngle: null,
      elbowAngle: null,
      leftElbowAngle: null,
      rightElbowAngle: null,
      shoulderAngle: null,
      leftShoulderAngle: null,
      rightShoulderAngle: null,
      rangeOfMotion: null,
      romPercent: null,
      depth: null, // Null for non-depth movements
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
    this.smoothedLeftElbow = 85;
    this.smoothedRightElbow = 85;
    this.smoothedShoulderElevation = 85;
    this.startBaseline = 85;
    this.repStartTime = 0;
    this.minAngleInRep = 180;
    this.maxAngleInRep = 0;
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

    // Confidence gating
    if (frame.confidence < SHOULDER_PRESS_CONFIG.confidenceThreshold || !frame.landmarks || frame.landmarks.length < 25) {
      this.metrics.phase = 'IDLE';
      this.metrics.elbowAngle = null;
      this.metrics.shoulderAngle = null;
      this.metrics.romPercent = null;
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    const lm = frame.landmarks;
    const leftArmVisible = this.isJointGroupVisible(lm, [LEFT_WRIST, LEFT_ELBOW, LEFT_SHOULDER]);
    const rightArmVisible = this.isJointGroupVisible(lm, [RIGHT_WRIST, RIGHT_ELBOW, RIGHT_SHOULDER]);

    if (!leftArmVisible && !rightArmVisible) {
      this.metrics.phase = 'IDLE';
      this.metrics.elbowAngle = null;
      this.metrics.shoulderAngle = null;
      this.metrics.romPercent = null;
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    // 1. Calculate & Smooth Angles
    let leftAngle: number | null = null;
    let rightAngle: number | null = null;
    let leftElevation: number | null = null;
    let rightElevation: number | null = null;
    const alpha = SHOULDER_PRESS_CONFIG.alphaSmoothing;

    if (leftArmVisible) {
      const rawElbow = calculateAngle(lm[LEFT_SHOULDER], lm[LEFT_ELBOW], lm[LEFT_WRIST]);
      this.smoothedLeftElbow = (alpha * rawElbow) + ((1 - alpha) * this.smoothedLeftElbow);
      leftAngle = Math.round(this.smoothedLeftElbow);

      if (lm[LEFT_HIP]) {
        leftElevation = Math.round(calculateAngle(lm[LEFT_HIP], lm[LEFT_SHOULDER], lm[LEFT_ELBOW]));
      }
    }

    if (rightArmVisible) {
      const rawElbow = calculateAngle(lm[RIGHT_SHOULDER], lm[RIGHT_ELBOW], lm[RIGHT_WRIST]);
      this.smoothedRightElbow = (alpha * rawElbow) + ((1 - alpha) * this.smoothedRightElbow);
      rightAngle = Math.round(this.smoothedRightElbow);

      if (lm[RIGHT_HIP]) {
        rightElevation = Math.round(calculateAngle(lm[RIGHT_HIP], lm[RIGHT_SHOULDER], lm[RIGHT_ELBOW]));
      }
    }

    this.metrics.leftElbowAngle = leftAngle;
    this.metrics.rightElbowAngle = rightAngle;
    this.metrics.leftShoulderAngle = leftElevation;
    this.metrics.rightShoulderAngle = rightElevation;

    // Primary angle for movement tracking (average of visible arms or available arm)
    let primaryAngle: number;
    if (leftAngle !== null && rightAngle !== null) {
      primaryAngle = Math.round((leftAngle + rightAngle) / 2);
    } else {
      primaryAngle = leftAngle ?? rightAngle ?? 85;
    }
    this.metrics.elbowAngle = primaryAngle;

    if (leftElevation !== null && rightElevation !== null) {
      this.metrics.shoulderAngle = Math.round((leftElevation + rightElevation) / 2);
    } else {
      this.metrics.shoulderAngle = leftElevation ?? rightElevation ?? null;
    }

    // Adapt rack baseline when at start
    if (primaryAngle <= SHOULDER_PRESS_CONFIG.rackAngleThreshold) {
      this.startBaseline = (0.02 * primaryAngle) + (0.98 * this.startBaseline);
    }

    // 2. Normalized Range of Motion calculation (increasing from rack to overhead)
    if (this.metrics.phase !== 'IDLE') {
      const normalized = calculateNormalizedROM(
        primaryAngle,
        this.startBaseline,
        SHOULDER_PRESS_CONFIG.targetLockoutDegrees,
        { clamp: true }
      );
      this.metrics.romPercent = normalized;
    } else {
      this.metrics.romPercent = 0;
    }

    // 3. State Machine for Pressing Movement
    this.processStateMachine(primaryAngle, frame.timestamp);

    // 4. Form observations: Bilateral asymmetry and Torso alignment
    let leftRightDiff: number | null = null;
    let torsoAngle: number | null = null;

    if (leftAngle !== null && rightAngle !== null) {
      leftRightDiff = Math.abs(leftAngle - rightAngle);
    }

    // Torso angle (Shoulder -> Hip -> Knee)
    const shoulderIdx = leftArmVisible ? LEFT_SHOULDER : RIGHT_SHOULDER;
    const hipIdx = leftArmVisible ? LEFT_HIP : RIGHT_HIP;
    const kneeIdx = leftArmVisible ? LEFT_KNEE : RIGHT_KNEE;

    if (lm[shoulderIdx] && lm[hipIdx] && lm[kneeIdx] && lm[hipIdx].visibility >= SHOULDER_PRESS_CONFIG.confidenceThreshold) {
      torsoAngle = Math.round(calculateAngle(lm[shoulderIdx], lm[hipIdx], lm[kneeIdx]));
      this.metrics.hipAngle = torsoAngle;
    }

    // 5. Synchronize Form Analyzer
    this.formAnalyzer.analyze(frame, this.metrics, {
      leftRightDiff,
      torsoAngle,
      isBothArmsVisible: leftArmVisible && rightArmVisible,
    });
  }

  private isJointGroupVisible(landmarks: PoseLandmark[], indices: number[]): boolean {
    return indices.every(idx => {
      const lm = landmarks[idx];
      return lm && lm.visibility >= SHOULDER_PRESS_CONFIG.confidenceThreshold;
    });
  }

  private processStateMachine(angle: number, timestamp: number): void {
    const { rackAngleThreshold, concentricThreshold, overheadLockoutThreshold, returnThreshold, minRepDurationMs } = SHOULDER_PRESS_CONFIG;

    switch (this.metrics.phase) {
      case 'IDLE':
        if (angle <= rackAngleThreshold + 10) {
          this.metrics.phase = 'STANDING';
          this.minAngleInRep = angle;
        }
        break;

      case 'STANDING':
        if (angle > concentricThreshold) {
          this.metrics.phase = 'CONCENTRIC';
          this.repStartTime = timestamp;
          this.minAngleInRep = Math.min(this.minAngleInRep, angle);
          this.maxAngleInRep = angle;
          this.metrics.currentRep = (this.metrics.reps ?? 0) + 1;
        } else {
          this.minAngleInRep = Math.min(this.minAngleInRep, angle);
        }
        break;

      case 'CONCENTRIC':
        if (angle > this.maxAngleInRep) {
          this.maxAngleInRep = angle;
        }

        if (angle >= overheadLockoutThreshold) {
          this.metrics.phase = 'BOTTOM'; // Overhead lockout peak
        } else if (angle < this.maxAngleInRep - 25 && angle <= returnThreshold) {
          // Aborted rep before reaching overhead
          this.metrics.phase = 'STANDING';
          this.metrics.currentRep = this.metrics.reps;
        }
        break;

      case 'BOTTOM':
        if (angle > this.maxAngleInRep) {
          this.maxAngleInRep = angle;
        }

        // When starting lowering back to shoulders
        if (angle < overheadLockoutThreshold - 10) {
          this.metrics.phase = 'ECCENTRIC';
        }
        break;

      case 'ECCENTRIC':
        if (angle <= returnThreshold) {
          const duration = timestamp - this.repStartTime;
          // Valid rep criteria: duration >= 500ms and pressed overhead to >= 145°
          if (duration >= minRepDurationMs && this.maxAngleInRep >= 145) {
            this.metrics.reps = (this.metrics.reps ?? 0) + 1;
            this.metrics.rangeOfMotion = Math.round(this.maxAngleInRep - this.minAngleInRep);
            this.metrics.repDurationMs = duration;
          }
          this.metrics.phase = 'STANDING';
          this.minAngleInRep = angle;
        } else if (angle > this.maxAngleInRep) {
          // Re-pressing during lowering
          this.metrics.phase = 'CONCENTRIC';
        }
        break;
    }
  }

  destroy(): void {
    this.reset();
  }
}
