import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { 
  ExerciseMetrics, 
  FormAssessment, 
  PoseFrame, 
  RepFormAssessment, 
  ExerciseType 
} from '../types';

/**
 * Placeholder analyzer for exercises that are defined in the system
 * but whose kinematics analysis algorithms have not yet been implemented.
 * 
 * Guarantees:
 * 1. Never runs squat kinematics on non-squat exercises.
 * 2. Emits an observational availability message ("Analysis for [exercise] is coming soon.").
 * 3. Does not fabricate reps or joint angles.
 * 4. Supports duration-based exercises (Plank) without fabricating repetition counts.
 */
export class UnsupportedExerciseAnalyzer implements ExerciseAnalyzer {
  readonly exerciseType: ExerciseType;
  readonly isRepetitionBased: boolean;
  private confidence = 0;
  private lastTimestamp = 0;

  constructor(exerciseType: ExerciseType, isRepetitionBased = true) {
    this.exerciseType = exerciseType;
    this.isRepetitionBased = isRepetitionBased;
  }

  async initialize(): Promise<void> {
    this.reset();
  }

  reset(): void {
    this.confidence = 0;
    this.lastTimestamp = 0;
  }

  analyzePoseFrame(frame: PoseFrame): void {
    // Record real confidence and timestamp without calculating inappropriate kinematics
    this.confidence = frame.confidence;
    this.lastTimestamp = frame.timestamp;
  }

  getMetrics(): ExerciseMetrics {
    return {
      exercise: this.exerciseType,
      phase: 'IDLE',
      reps: this.isRepetitionBased ? 0 : null,
      currentRep: this.isRepetitionBased ? 0 : null,
      holdDurationMs: this.isRepetitionBased ? null : 0,
      holdDurationSec: this.isRepetitionBased ? null : 0,
      kneeAngle: null,
      leftKneeAngle: null,
      rightKneeAngle: null,
      hipAngle: null,
      leftHipAngle: null,
      rightHipAngle: null,
      elbowAngle: null,
      leftElbowAngle: null,
      rightElbowAngle: null,
      shoulderAngle: null,
      leftShoulderAngle: null,
      rightShoulderAngle: null,
      spineAngle: null,
      jointAngles: {},
      rangeOfMotion: null,
      depth: null,
      repDurationMs: null,
      confidence: this.confidence,
      timestamp: this.lastTimestamp,
    };
  }

  getFormAssessment(): FormAssessment {
    const formattedName = this.exerciseType.replace(/_/g, ' ').toLowerCase();
    const capitalized = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);

    return {
      overallScore: 0,
      activeFeedback: `Analysis for ${capitalized} is coming soon.`,
      issues: [],
      confidence: this.confidence,
      timestamp: this.lastTimestamp,
      mlPrediction: { status: 'MODEL_NOT_AVAILABLE', timestamp: this.lastTimestamp }
    };
  }

  getRepAssessments(): RepFormAssessment[] {
    return [];
  }

  destroy(): void {
    this.reset();
  }
}
