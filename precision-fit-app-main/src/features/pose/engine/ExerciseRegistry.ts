import { ExerciseType, ExerciseDefinition } from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { SquatAnalyzer } from './SquatAnalyzer';
import { PushUpAnalyzer } from './PushUpAnalyzer';
import { LungeAnalyzer } from './LungeAnalyzer';
import { BicepCurlAnalyzer } from './BicepCurlAnalyzer';
import { ShoulderPressAnalyzer } from './ShoulderPressAnalyzer';
import { UnsupportedExerciseAnalyzer } from './UnsupportedExerciseAnalyzer';

export class UnsupportedExerciseError extends Error {
  readonly exercise: ExerciseType;
  constructor(exercise: ExerciseType, message?: string) {
    super(message || `Exercise analyzer for '${exercise}' is not yet implemented.`);
    this.name = 'UnsupportedExerciseError';
    this.exercise = exercise;
  }
}

/**
 * Central registry and factory for all exercises in FitAssist Pro.
 * Provides capability metadata, view guidelines, and resolves appropriate analyzers.
 */
export class ExerciseRegistry {
  private static readonly DEFINITIONS: Record<ExerciseType, ExerciseDefinition> = {
    SQUAT: {
      id: 'SQUAT',
      name: 'Squat',
      isImplemented: true,
      isRepetitionBased: true,
      supportedMetrics: [
        'kneeAngle',
        'hipAngle',
        'depth',
        'rangeOfMotion',
        'repDurationMs',
        'asymmetry',
        'confidence'
      ],
      requiredLandmarkGroups: ['HIPS', 'KNEES', 'ANKLES', 'SHOULDERS'],
      cameraViewRequirement: 'SAGITTAL',
      cameraViewDescription: 'Side view (sagittal) recommended for accurate depth and knee-hip tracking.',
      description: 'Lower-body compound movement tracking knee flexion, hip crease depth, and torso inclination.'
    },
    PUSH_UP: {
      id: 'PUSH_UP',
      name: 'Push-up',
      isImplemented: true,
      isRepetitionBased: true,
      supportedMetrics: [
        'elbowAngle',
        'leftElbowAngle',
        'rightElbowAngle',
        'hipAngle',
        'depth',
        'rangeOfMotion',
        'repDurationMs',
        'confidence'
      ],
      requiredLandmarkGroups: ['SHOULDERS', 'ELBOWS', 'WRISTS', 'HIPS', 'ANKLES'],
      cameraViewRequirement: 'SAGITTAL',
      cameraViewDescription: 'Side view (sagittal) or 45-degree angle recommended for spine alignment and chest depth.',
      description: 'Upper-body pushing movement tracking elbow flexion, chest depth, and plank line integrity.'
    },
    LUNGE: {
      id: 'LUNGE',
      name: 'Lunge',
      isImplemented: true,
      isRepetitionBased: true,
      supportedMetrics: [
        'kneeAngle',
        'leftKneeAngle',
        'rightKneeAngle',
        'frontKneeAngle',
        'rearKneeAngle',
        'activeLeg',
        'torsoAngle',
        'depth',
        'rangeOfMotion',
        'repDurationMs',
        'confidence'
      ],
      requiredLandmarkGroups: ['HIPS', 'KNEES', 'ANKLES', 'SHOULDERS'],
      cameraViewRequirement: 'SAGITTAL',
      cameraViewDescription: 'Side view (sagittal) recommended to observe both lead and trail knee angles, depth, and upright torso.',
      description: 'Unilateral lower-body movement tracking lead and trailing knee angles and torso posture.'
    },
    BICEP_CURL: {
      id: 'BICEP_CURL',
      name: 'Bicep Curl',
      isImplemented: true,
      isRepetitionBased: true,
      supportedMetrics: [
        'elbowAngle',
        'leftElbowAngle',
        'rightElbowAngle',
        'activeArm',
        'rangeOfMotion',
        'romPercent',
        'repDurationMs',
        'confidence'
      ],
      requiredLandmarkGroups: ['SHOULDERS', 'ELBOWS', 'WRISTS', 'HIPS'],
      cameraViewRequirement: 'SAGITTAL',
      cameraViewDescription: 'Side view or 45-degree angle recommended to monitor elbow pin, flexion depth, and torso stability.',
      description: 'Arm isolation movement tracking elbow flexion, peak contraction, and torso stability.'
    },
    SHOULDER_PRESS: {
      id: 'SHOULDER_PRESS',
      name: 'Shoulder Press',
      isImplemented: true,
      isRepetitionBased: true,
      supportedMetrics: [
        'elbowAngle',
        'leftElbowAngle',
        'rightElbowAngle',
        'shoulderAngle',
        'leftShoulderAngle',
        'rightShoulderAngle',
        'rangeOfMotion',
        'romPercent',
        'repDurationMs',
        'confidence'
      ],
      requiredLandmarkGroups: ['WRISTS', 'ELBOWS', 'SHOULDERS', 'HIPS'],
      cameraViewRequirement: 'FRONTAL',
      cameraViewDescription: 'Front view (frontal) recommended to track bilateral symmetry and overhead lockout.',
      description: 'Vertical overhead pressing movement tracking elbow extension, symmetry, and core bracing.'
    },
    PLANK: {
      id: 'PLANK',
      name: 'Plank',
      isImplemented: false,
      isRepetitionBased: false,
      supportedMetrics: [
        'holdDurationMs',
        'spineAngle',
        'hipElevation',
        'shoulderStability',
        'confidence'
      ],
      requiredLandmarkGroups: ['SHOULDERS', 'ELBOWS', 'HIPS', 'KNEES', 'ANKLES'],
      cameraViewRequirement: 'SAGITTAL',
      cameraViewDescription: 'Side view (sagittal) recommended to observe straight-line alignment from head to heels.',
      description: 'Isometric core hold tracking neutral spine alignment, hip sagging/piking, and hold duration.'
    },
    UNKNOWN: {
      id: 'UNKNOWN',
      name: 'Unknown Exercise',
      isImplemented: false,
      isRepetitionBased: false,
      supportedMetrics: ['confidence'],
      requiredLandmarkGroups: [],
      cameraViewRequirement: 'ANY',
      cameraViewDescription: 'Any camera view.',
      description: 'Unrecognized exercise type.'
    }
  };

  /**
   * Retrieves capability metadata for a specific exercise type.
   */
  static getDefinition(exercise: ExerciseType): ExerciseDefinition {
    return this.DEFINITIONS[exercise] || this.DEFINITIONS.UNKNOWN;
  }

  /**
   * Returns all standard exercises supported in the FitAssist architecture.
   * Filters out 'UNKNOWN' to return the canonical exercise list.
   */
  static getAllDefinitions(): ExerciseDefinition[] {
    return [
      this.DEFINITIONS.SQUAT,
      this.DEFINITIONS.PUSH_UP,
      this.DEFINITIONS.LUNGE,
      this.DEFINITIONS.BICEP_CURL,
      this.DEFINITIONS.SHOULDER_PRESS,
      this.DEFINITIONS.PLANK
    ];
  }

  /**
   * Returns whether active kinematics and form analysis is currently implemented.
   */
  static isImplemented(exercise: ExerciseType): boolean {
    return this.getDefinition(exercise).isImplemented;
  }

  /**
   * Returns whether the exercise tracks repetitions (e.g. Squat) or duration (e.g. Plank).
   */
  static isRepetitionBased(exercise: ExerciseType): boolean {
    return this.getDefinition(exercise).isRepetitionBased;
  }

  /**
   * Factory method to resolve the analyzer for an exercise.
   * - SQUAT resolves to SquatAnalyzer.
   * - PUSH_UP resolves to PushUpAnalyzer.
   * - LUNGE resolves to LungeAnalyzer.
   * - BICEP_CURL resolves to BicepCurlAnalyzer.
   * - SHOULDER_PRESS resolves to ShoulderPressAnalyzer.
   * - Unimplemented exercises resolve to an UnsupportedExerciseAnalyzer (never fallback to Squat).
   * - Unknown/invalid exercise throws UnsupportedExerciseError when strict, or returns an unsupported analyzer.
   */
  static getAnalyzer(exercise: ExerciseType, strict = false): ExerciseAnalyzer {
    switch (exercise) {
      case 'SQUAT':
        return new SquatAnalyzer();
      case 'PUSH_UP':
        return new PushUpAnalyzer();
      case 'LUNGE':
        return new LungeAnalyzer();
      case 'BICEP_CURL':
        return new BicepCurlAnalyzer();
      case 'SHOULDER_PRESS':
        return new ShoulderPressAnalyzer();
      case 'PLANK': {
        const def = this.getDefinition(exercise);
        return new UnsupportedExerciseAnalyzer(exercise, def.isRepetitionBased);
      }
      case 'UNKNOWN':
      default:
        if (strict) {
          throw new UnsupportedExerciseError(exercise);
        }
        return new UnsupportedExerciseAnalyzer(exercise, false);
    }
  }
}
