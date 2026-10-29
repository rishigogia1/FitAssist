import { 
  PoseFrame, 
  ExerciseMetrics, 
  FormAssessment, 
  RepFormAssessment, 
  ExerciseType 
} from '../types';

/**
 * Standard contract for all exercise form analyzers in FitAssist Pro.
 * Supports both repetition-based exercises (Squats, Push-ups) and
 * duration-based isometric holds (Planks).
 */
export interface ExerciseAnalyzer {
  /**
   * Strongly typed identifier of the exercise this analyzer handles.
   */
  readonly exerciseType: ExerciseType;

  /**
   * Indicates whether this exercise counts repetitions (e.g. Squat, Push-up)
   * or tracks isometric hold duration (e.g. Plank).
   */
  readonly isRepetitionBased: boolean;

  /**
   * Asynchronously initialize models, baseline calibrations, or dependencies.
   */
  initialize(): Promise<void>;

  /**
   * Reset all state, counters, timers, and buffers back to pristine initial condition.
   */
  reset(): void;

  /**
   * Process a single incoming PoseFrame containing 3D landmark coordinates and timestamp.
   */
  analyzePoseFrame(frame: PoseFrame): void;

  /**
   * Returns current kinematics and exercise metrics (angles, phase, reps, or hold duration).
   */
  getMetrics(): ExerciseMetrics;

  /**
   * Returns current real-time observational form assessment and feedback cues.
   */
  getFormAssessment?(): FormAssessment;

  /**
   * Returns historical assessments for completed repetitions (repetition-based exercises).
   */
  getRepAssessments?(): RepFormAssessment[];

  /**
   * Cleanup resources, workers, or buffers when switching exercises or unmounting.
   */
  destroy?(): void;
}
