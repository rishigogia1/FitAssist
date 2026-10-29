import {
  PoseFrame,
  PoseLandmark,
  ExerciseMetrics,
  FormAssessment,
  RepFormAssessment
} from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { calculateAngle } from '../utils/landmarkUtils';
import { BicepCurlFormAnalyzer } from './BicepCurlFormAnalyzer';
import { calculateNormalizedROM } from './MovementRangeNormalizer';

// Landmark IDs from MediaPipe Pose
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

export const BICEP_CURL_CONFIG = {
  confidenceThreshold: 0.5,
  extendedAngleThreshold: 145, // Arm extended downwards
  concentricThreshold: 135,    // Beginning flexion upward
  contractedThreshold: 70,     // Peak curl flexion reached (<= 70°)
  returnThreshold: 140,        // Arm returned near full extension
  minCurlTarget: 50,           // Biomechanical target peak for 100% normalized ROM
  minRepDurationMs: 400,       // Minimum time for a plausible human repetition
  alphaSmoothing: 0.45,        // Responsive EMA factor
};

export class BicepCurlAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType = 'BICEP_CURL';
  readonly isRepetitionBased = true;
  private metrics: ExerciseMetrics;
  private formAnalyzer: BicepCurlFormAnalyzer;

  // Smoothed angles
  private smoothedLeftElbow = 160;
  private smoothedRightElbow = 160;
  private extendedBaseline = 160;

  // Running repetition extrema & timing
  private repStartTime = 0;
  private minAngleInRep = 180;
  private maxAngleInRep = 0;
  private startTorsoX = 0;

  constructor() {
    this.formAnalyzer = new BicepCurlFormAnalyzer();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): ExerciseMetrics {
    return {
      exercise: 'BICEP_CURL',
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
      activeArm: 'UNKNOWN',
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
    this.smoothedLeftElbow = 160;
    this.smoothedRightElbow = 160;
    this.extendedBaseline = 160;
    this.repStartTime = 0;
    this.minAngleInRep = 180;
    this.maxAngleInRep = 0;
    this.startTorsoX = 0;
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
    if (frame.confidence < BICEP_CURL_CONFIG.confidenceThreshold || !frame.landmarks || frame.landmarks.length < 25) {
      this.metrics.phase = 'IDLE';
      this.metrics.elbowAngle = null;
      this.metrics.leftElbowAngle = null;
      this.metrics.rightElbowAngle = null;
      this.metrics.activeArm = 'UNKNOWN';
      this.metrics.romPercent = null;
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    const lm = frame.landmarks;
    const leftArmVisible = this.isJointGroupVisible(lm, [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST]);
    const rightArmVisible = this.isJointGroupVisible(lm, [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]);

    if (!leftArmVisible && !rightArmVisible) {
      this.metrics.phase = 'IDLE';
      this.metrics.elbowAngle = null;
      this.metrics.activeArm = 'UNKNOWN';
      this.formAnalyzer.analyze(frame, this.metrics);
      return;
    }

    // 1. Calculate & Smooth Angles
    let leftAngle: number | null = null;
    let rightAngle: number | null = null;
    const alpha = BICEP_CURL_CONFIG.alphaSmoothing;

    if (leftArmVisible) {
      const rawLeft = calculateAngle(lm[LEFT_SHOULDER], lm[LEFT_ELBOW], lm[LEFT_WRIST]);
      this.smoothedLeftElbow = (alpha * rawLeft) + ((1 - alpha) * this.smoothedLeftElbow);
      leftAngle = Math.round(this.smoothedLeftElbow);
    }

    if (rightArmVisible) {
      const rawRight = calculateAngle(lm[RIGHT_SHOULDER], lm[RIGHT_ELBOW], lm[RIGHT_WRIST]);
      this.smoothedRightElbow = (alpha * rawRight) + ((1 - alpha) * this.smoothedRightElbow);
      rightAngle = Math.round(this.smoothedRightElbow);
    }

    this.metrics.leftElbowAngle = leftAngle;
    this.metrics.rightElbowAngle = rightAngle;

    // 2. Active Arm Discrimination
    let activeArm: 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN' = 'UNKNOWN';
    let primaryAngle: number;

    if (leftArmVisible && rightArmVisible && leftAngle !== null && rightAngle !== null) {
      const angleDiff = Math.abs(leftAngle - rightAngle);
      if (angleDiff <= 25) {
        activeArm = 'BOTH';
        primaryAngle = Math.round((leftAngle + rightAngle) / 2);
      } else if (leftAngle < rightAngle - 25) {
        activeArm = 'LEFT';
        primaryAngle = leftAngle;
      } else if (rightAngle < leftAngle - 25) {
        activeArm = 'RIGHT';
        primaryAngle = rightAngle;
      } else {
        activeArm = 'BOTH';
        primaryAngle = Math.min(leftAngle, rightAngle);
      }
    } else if (leftArmVisible && leftAngle !== null) {
      activeArm = 'LEFT';
      primaryAngle = leftAngle;
    } else if (rightArmVisible && rightAngle !== null) {
      activeArm = 'RIGHT';
      primaryAngle = rightAngle;
    } else {
      activeArm = 'UNKNOWN';
      primaryAngle = 160;
    }

    this.metrics.activeArm = activeArm;
    this.metrics.elbowAngle = primaryAngle;

    // Adapt baseline when extended
    if (primaryAngle >= BICEP_CURL_CONFIG.extendedAngleThreshold) {
      this.extendedBaseline = (0.02 * primaryAngle) + (0.98 * this.extendedBaseline);
    }

    // 3. Normalized Range of Motion calculation (flexion from baseline to 50°)
    if (this.metrics.phase !== 'IDLE') {
      const normalized = calculateNormalizedROM(
        primaryAngle,
        this.extendedBaseline,
        BICEP_CURL_CONFIG.minCurlTarget,
        { clamp: true }
      );
      this.metrics.romPercent = normalized;
    } else {
      this.metrics.romPercent = 0;
    }

    // 4. State Machine for Repetition Counting
    this.processStateMachine(primaryAngle, frame.timestamp);

    // 5. Kinematic observations for form analysis (Elbow drift, Torso sway, Bilateral asymmetry)
    let elbowDrift: number | null = null;
    let torsoSway: number | null = null;
    let leftRightDiff: number | null = null;

    if (activeArm === 'LEFT' && leftArmVisible) {
      elbowDrift = Math.abs(lm[LEFT_ELBOW].x - lm[LEFT_SHOULDER].x);
    } else if (activeArm === 'RIGHT' && rightArmVisible) {
      elbowDrift = Math.abs(lm[RIGHT_ELBOW].x - lm[RIGHT_SHOULDER].x);
    } else if (leftArmVisible && rightArmVisible) {
      elbowDrift = Math.max(
        Math.abs(lm[LEFT_ELBOW].x - lm[LEFT_SHOULDER].x),
        Math.abs(lm[RIGHT_ELBOW].x - lm[RIGHT_SHOULDER].x)
      );
    }

    if (lm[LEFT_SHOULDER] && lm[LEFT_HIP]) {
      const torsoX = (lm[LEFT_SHOULDER].x + (lm[RIGHT_SHOULDER]?.x ?? lm[LEFT_SHOULDER].x)) / 2;
      if (this.startTorsoX === 0) {
        this.startTorsoX = torsoX;
      }
      torsoSway = Math.round(Math.abs(torsoX - this.startTorsoX) * 100);
    }

    if (leftAngle !== null && rightAngle !== null) {
      leftRightDiff = Math.abs(leftAngle - rightAngle);
    }

    // 6. Synchronize form analyzer
    this.formAnalyzer.analyze(frame, this.metrics, {
      elbowDrift,
      torsoSway,
      leftRightDiff,
      isBothArmsVisible: leftArmVisible && rightArmVisible,
    });
  }

  private isJointGroupVisible(landmarks: PoseLandmark[], indices: number[]): boolean {
    return indices.every(idx => {
      const lm = landmarks[idx];
      return lm && lm.visibility >= BICEP_CURL_CONFIG.confidenceThreshold;
    });
  }

  private processStateMachine(angle: number, timestamp: number): void {
    const { extendedAngleThreshold, concentricThreshold, contractedThreshold, returnThreshold, minRepDurationMs } = BICEP_CURL_CONFIG;

    switch (this.metrics.phase) {
      case 'IDLE':
        if (angle >= extendedAngleThreshold) {
          this.metrics.phase = 'STANDING';
          this.maxAngleInRep = angle;
        }
        break;

      case 'STANDING':
        if (angle < concentricThreshold) {
          this.metrics.phase = 'CONCENTRIC';
          this.repStartTime = timestamp;
          this.minAngleInRep = angle;
          this.maxAngleInRep = Math.max(this.maxAngleInRep, angle);
          this.metrics.currentRep = (this.metrics.reps ?? 0) + 1;
        } else {
          this.maxAngleInRep = Math.max(this.maxAngleInRep, angle);
        }
        break;

      case 'CONCENTRIC':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        if (angle <= contractedThreshold) {
          this.metrics.phase = 'BOTTOM'; // Contracted peak position
        } else if (angle > this.minAngleInRep + 25 && angle >= returnThreshold) {
          // Aborted repetition before reaching valid curl
          this.metrics.phase = 'STANDING';
          this.metrics.currentRep = this.metrics.reps;
        }
        break;

      case 'BOTTOM':
        if (angle < this.minAngleInRep) {
          this.minAngleInRep = angle;
        }

        // When starting extension back down
        if (angle > contractedThreshold + 10) {
          this.metrics.phase = 'ECCENTRIC';
        }
        break;

      case 'ECCENTRIC':
        if (angle >= returnThreshold) {
          const duration = timestamp - this.repStartTime;
          // Valid rep criteria: plausible human duration and curl reached at least moderate flexion
          if (duration >= minRepDurationMs && this.minAngleInRep <= 85) {
            this.metrics.reps = (this.metrics.reps ?? 0) + 1;
            this.metrics.rangeOfMotion = Math.round(this.maxAngleInRep - this.minAngleInRep);
            this.metrics.repDurationMs = duration;
          }
          this.metrics.phase = 'STANDING';
          this.maxAngleInRep = angle;
        } else if (angle < this.minAngleInRep) {
          // Re-curling during descent
          this.metrics.phase = 'CONCENTRIC';
        }
        break;
    }
  }

  destroy(): void {
    this.reset();
  }
}
