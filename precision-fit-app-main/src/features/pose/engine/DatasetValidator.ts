import { PoseFeatureVector } from './TemporalSequenceBuffer';

export interface DatasetSample {
  sampleId: string;
  participantId: string;
  sessionId: string;
  exercise: string;
  label: string;
  featureVersion: string;
  windowSize: number;
  stride: number;
  features: PoseFeatureVector[];
  timestamp: number;
  source: string;
}

export interface ValidationReport {
  isValid: boolean;
  validCount: number;
  invalidCount: number;
  warnings: string[];
  errors: string[];
  labelDistribution: Record<string, number>;
  participantCount: number;
  sessionCount: number;
}

export class DatasetValidator {
  static validate(samples: any[]): ValidationReport {
    const report: ValidationReport = {
      isValid: true,
      validCount: 0,
      invalidCount: 0,
      warnings: [],
      errors: [],
      labelDistribution: {},
      participantCount: 0,
      sessionCount: 0
    };

    if (!Array.isArray(samples)) {
      report.isValid = false;
      report.errors.push("Dataset must be an array");
      return report;
    }

    if (samples.length === 0) {
      report.isValid = false;
      report.errors.push("Dataset is empty");
      return report;
    }

    const participants = new Set<string>();
    const sessions = new Set<string>();

    samples.forEach((s, index) => {
      const sampleErrors = this.validateSample(s);
      if (sampleErrors.length > 0) {
        report.invalidCount++;
        report.isValid = false;
        report.errors.push(`Sample ${index} (${s.sampleId || 'unknown'}): ${sampleErrors.join(', ')}`);
      } else {
        report.validCount++;
        participants.add(s.participantId);
        sessions.add(s.sessionId);

        // Label distribution
        report.labelDistribution[s.label] = (report.labelDistribution[s.label] || 0) + 1;
      }
    });

    report.participantCount = participants.size;
    report.sessionCount = sessions.size;

    // Class balance check
    if (report.validCount > 0) {
      const counts = Object.values(report.labelDistribution);
      const minCount = Math.min(...counts);
      const maxCount = Math.max(...counts);
      
      const expectedLabels = [
        'GOOD_FORM',
        'INSUFFICIENT_DEPTH',
        'EXCESSIVE_FORWARD_LEAN',
        'KNEE_VALGUS',
        'ASYMMETRIC_MOVEMENT'
      ];

      for (const label of expectedLabels) {
        if (!report.labelDistribution[label] || report.labelDistribution[label] === 0) {
           report.warnings.push(`Class ${label} is entirely missing.`);
        }
      }

      if (maxCount > 0 && minCount < (maxCount * 0.2)) {
        report.warnings.push("Dataset structurally valid, but class distribution is currently imbalanced.");
      } else if (report.validCount < 100) {
        report.warnings.push("Dataset structural validation passed, but size is likely too small for robust ML training.");
      }
    }

    return report;
  }

  static validateSample(s: any): string[] {
    const errors: string[] = [];

    if (!s) return ["Sample is null or undefined"];

    if (typeof s.sampleId !== 'string' || !s.sampleId) errors.push("Missing sampleId");
    if (typeof s.participantId !== 'string' || !s.participantId) errors.push("Missing participantId");
    if (typeof s.sessionId !== 'string' || !s.sessionId) errors.push("Missing sessionId");
    if (typeof s.exercise !== 'string' || !s.exercise) errors.push("Missing exercise");
    if (typeof s.label !== 'string' || !s.label) errors.push("Missing label");
    if (s.featureVersion !== 'pose-features-v1') errors.push("Invalid featureVersion");
    if (s.windowSize !== 30) errors.push("Invalid windowSize");
    
    if (typeof s.timestamp !== 'number' || isNaN(s.timestamp)) errors.push("Invalid timestamp");

    if (!Array.isArray(s.features)) {
      errors.push("features is not an array");
    } else if (s.features.length !== 30) {
      errors.push(`Expected exactly 30 frames, got ${s.features.length}`);
    } else {
      for (let i = 0; i < s.features.length; i++) {
        const frame = s.features[i];
        if (!Array.isArray(frame.features)) {
           errors.push(`Frame ${i} missing features array`);
           break;
        }
        if (frame.features.length !== 32) {
           errors.push(`Frame ${i} has ${frame.features.length} numeric features, expected 32`);
           break;
        }
        for (const val of frame.features) {
          if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            errors.push(`Frame ${i} contains NaN or Infinity in features`);
            break;
          }
        }
      }
    }

    return errors;
  }
}
