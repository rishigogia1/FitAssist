import { ExerciseType } from '../types';
import { ExerciseAnalyzer } from './ExerciseAnalyzer';
import { ExerciseRegistry, UnsupportedExerciseError } from './ExerciseRegistry';

/**
 * Backward-compatible factory wrapper delegating to ExerciseRegistry.
 */
export class ExerciseAnalyzerFactory {
  static isSupported(exercise: ExerciseType): boolean {
    return ExerciseRegistry.isImplemented(exercise);
  }

  static getExerciseAnalyzer(exercise: ExerciseType): ExerciseAnalyzer {
    if (!ExerciseRegistry.isImplemented(exercise)) {
      throw new UnsupportedExerciseError(
        exercise,
        `Exercise analyzer for ${exercise} is currently unsupported/unavailable.`
      );
    }
    return ExerciseRegistry.getAnalyzer(exercise);
  }
}
