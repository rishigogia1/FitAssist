import {
  PoseFrame,
  ExerciseMetrics,
  FormAssessment,
  FormIssue,
  FormIssueType,
  RepFormAssessment
} from '../types';

export const SHOULDER_PRESS_FORM_CONFIG = {
  confidenceThreshold: 0.5,
  minOverheadExtensionDegrees: 150, // Must reach >= 150° for full overhead extension
  maxLoweringThresholdDegrees: 110, // Must lower back to <= 110° at bottom rack
  asymmetryThresholdDegrees: 20,    // Max discrepancy between arms
  torsoArchThresholdDegrees: 158,   // Torso angle threshold for hyperextension
  fastConcentricThresholdMs: 400,
  fastEccentricThresholdMs: 400,
  cooldownMs: 2500,
  persistenceFrames: 3,
};

export class ShoulderPressFormAnalyzer {
  private assessment: FormAssessment;
  private issueTracker: Map<FormIssueType, { frames: number; reported: boolean }> = new Map();
  private lastFeedbackTime = 0;
  private currentFeedback: string | null = null;
  private lastPhase = 'IDLE';

  private repAssessments: RepFormAssessment[] = [];

  // Running rep-level stats
  private repMaxOverheadAngle = 0;
  private repMinReturnAngle = 180;
  private repMaxAsymmetry = 0;
  private repMinTorsoAngle = 180;
  private repIssues: Set<FormIssueType> = new Set();

  // Timers
  private concentricStartTime = 0;
  private eccentricStartTime = 0;
  private concentricDuration = 0;
  private eccentricDuration = 0;

  constructor() {
    this.assessment = this.getInitialAssessment();
  }

  private getInitialAssessment(): FormAssessment {
    return {
      overallScore: 100,
      activeFeedback: null,
      issues: [],
      confidence: 1,
      timestamp: 0,
      mlPrediction: { status: 'MODEL_NOT_AVAILABLE', timestamp: 0 }
    };
  }

  reset(): void {
    this.assessment = this.getInitialAssessment();
    this.issueTracker.clear();
    this.lastFeedbackTime = 0;
    this.currentFeedback = null;
    this.lastPhase = 'IDLE';
    this.resetRepMetrics();
    this.repAssessments = [];
  }

  private resetRepMetrics(): void {
    this.repMaxOverheadAngle = 0;
    this.repMinReturnAngle = 180;
    this.repMaxAsymmetry = 0;
    this.repMinTorsoAngle = 180;
    this.repIssues.clear();
    this.concentricDuration = 0;
    this.eccentricDuration = 0;
    this.concentricStartTime = 0;
    this.eccentricStartTime = 0;
  }

  getAssessment(): FormAssessment {
    return { ...this.assessment };
  }

  getRepAssessments(): RepFormAssessment[] {
    return [...this.repAssessments];
  }

  analyze(
    frame: PoseFrame,
    metrics: ExerciseMetrics,
    extraContext?: {
      leftRightDiff?: number | null;
      torsoAngle?: number | null;
      isBothArmsVisible?: boolean;
    }
  ): void {
    this.assessment.timestamp = frame.timestamp;
    this.assessment.confidence = frame.confidence;

    const currentIssues: FormIssue[] = [];

    // 1. Confidence check
    if (frame.confidence < SHOULDER_PRESS_FORM_CONFIG.confidenceThreshold) {
      currentIssues.push({
        type: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        message: 'Ensure upper body and arms are clearly visible.'
      });
      this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
      return;
    }

    // 2. Track phase transitions & timing
    // In shoulder press: CONCENTRIC is pressing overhead, BOTTOM is overhead lockout, ECCENTRIC is lowering to shoulders
    if (this.lastPhase !== metrics.phase) {
      if (metrics.phase === 'CONCENTRIC') {
        this.concentricStartTime = frame.timestamp;
        this.resetRepMetrics();
      } else if (metrics.phase === 'BOTTOM' || metrics.phase === 'ECCENTRIC') {
        if (this.lastPhase === 'CONCENTRIC') {
          this.concentricDuration = frame.timestamp - this.concentricStartTime;
          this.eccentricStartTime = frame.timestamp;
        }
      } else if (
        (metrics.phase === 'STANDING' || metrics.phase === 'TOP') &&
        (this.lastPhase === 'ECCENTRIC' || this.lastPhase === 'CONCENTRIC')
      ) {
        this.eccentricDuration = this.eccentricStartTime > 0 ? frame.timestamp - this.eccentricStartTime : 0;
        this.finalizeRep(metrics);
      }
      this.lastPhase = metrics.phase;
    }

    // 3. Collect active metrics during pressing movement
    if (metrics.phase === 'CONCENTRIC' || metrics.phase === 'BOTTOM' || metrics.phase === 'ECCENTRIC') {
      const currentAngle = metrics.elbowAngle ?? 90;
      if (currentAngle > this.repMaxOverheadAngle) {
        this.repMaxOverheadAngle = currentAngle;
      }
      if (currentAngle < this.repMinReturnAngle) {
        this.repMinReturnAngle = currentAngle;
      }

      // Check Bilateral Asymmetry
      if (
        extraContext?.isBothArmsVisible &&
        extraContext.leftRightDiff != null &&
        extraContext.leftRightDiff > SHOULDER_PRESS_FORM_CONFIG.asymmetryThresholdDegrees
      ) {
        if (extraContext.leftRightDiff > this.repMaxAsymmetry) {
          this.repMaxAsymmetry = extraContext.leftRightDiff;
        }
        currentIssues.push({
          type: 'LEFT_RIGHT_ASYMMETRY',
          severity: 'INFO',
          message: 'Press evenly through both arms.',
          metric: extraContext.leftRightDiff,
          threshold: SHOULDER_PRESS_FORM_CONFIG.asymmetryThresholdDegrees
        });
        this.repIssues.add('LEFT_RIGHT_ASYMMETRY');
      }

      // Check Lumbar Arching / Torso Lean
      if (extraContext?.torsoAngle != null) {
        if (extraContext.torsoAngle < this.repMinTorsoAngle) {
          this.repMinTorsoAngle = extraContext.torsoAngle;
        }
        if (extraContext.torsoAngle < SHOULDER_PRESS_FORM_CONFIG.torsoArchThresholdDegrees) {
          currentIssues.push({
            type: 'EXCESSIVE_TORSO_LEAN',
            severity: 'WARNING',
            message: 'Brace your core and avoid arching your lower back.',
            metric: extraContext.torsoAngle,
            threshold: SHOULDER_PRESS_FORM_CONFIG.torsoArchThresholdDegrees
          });
          this.repIssues.add('EXCESSIVE_TORSO_LEAN');
        }
      }
    }

    this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
    this.calculateFormScore();
  }

  private finalizeRep(metrics: ExerciseMetrics): void {
    const returnAngle = Math.min(this.repMinReturnAngle, metrics.elbowAngle ?? 180);

    // Check for Incomplete Overhead Extension (< 150°)
    if (this.repMaxOverheadAngle < SHOULDER_PRESS_FORM_CONFIG.minOverheadExtensionDegrees) {
      this.repIssues.add('INCOMPLETE_OVERHEAD_EXTENSION');
      this.forceFeedback('Press fully overhead to achieve full arm extension.');
    }

    // Check for Incomplete Lowering (> 110°)
    if (returnAngle > SHOULDER_PRESS_FORM_CONFIG.maxLoweringThresholdDegrees) {
      this.repIssues.add('INCOMPLETE_LOWERING');
      this.forceFeedback('Lower the weights all the way to shoulder level between reps.');
    }

    // Pacing checks
    if (this.concentricDuration > 0 && this.concentricDuration < SHOULDER_PRESS_FORM_CONFIG.fastConcentricThresholdMs) {
      this.repIssues.add('FAST_ASCENT');
      this.forceFeedback('Maintain smooth, controlled pressing power.');
    }

    if (this.eccentricDuration > 0 && this.eccentricDuration < SHOULDER_PRESS_FORM_CONFIG.fastEccentricThresholdMs) {
      this.repIssues.add('FAST_DESCENT');
      this.forceFeedback('Lower the weight under control.');
    }

    if (this.repIssues.size === 0) {
      this.forceFeedback('Good rep.');
    }

    // Calculate Rep Score
    let repScore = 100;
    if (this.repIssues.has('INCOMPLETE_OVERHEAD_EXTENSION')) repScore -= 15;
    if (this.repIssues.has('INCOMPLETE_LOWERING')) repScore -= 10;
    if (this.repIssues.has('EXCESSIVE_TORSO_LEAN')) repScore -= 15;
    if (this.repIssues.has('LEFT_RIGHT_ASYMMETRY')) repScore -= 5;
    if (this.repIssues.has('FAST_ASCENT')) repScore -= 5;
    if (this.repIssues.has('FAST_DESCENT')) repScore -= 5;

    repScore = Math.max(0, Math.min(100, repScore));

    this.repAssessments.push({
      repNumber: metrics.reps ?? this.repAssessments.length + 1,
      formScore: repScore,
      issues: Array.from(this.repIssues),
      depth: null, // Shoulder press is not a depth exercise
      rom: metrics.rangeOfMotion ?? null,
      romPercent: metrics.romPercent ?? null,
      leftRightDifference: Math.round(this.repMaxAsymmetry),
      eccentricDurationMs: this.eccentricDuration,
      concentricDurationMs: this.concentricDuration,
    });

    this.resetRepMetrics();
  }

  private forceFeedback(message: string): void {
    this.currentFeedback = message;
    this.lastFeedbackTime = Date.now();
  }

  private updateTrackerAndFeedback(currentIssues: FormIssue[], timestamp: number): void {
    const currentTypes = new Set(currentIssues.map(i => i.type));
    for (const [type, tracker] of this.issueTracker.entries()) {
      if (!currentTypes.has(type)) {
        tracker.frames = Math.max(0, tracker.frames - 1);
        if (tracker.frames === 0) {
          tracker.reported = false;
        }
      }
    }

    let highestPriorityIssue: FormIssue | null = null;
    const priorityList: FormIssueType[] = [
      'LOW_CONFIDENCE',
      'EXCESSIVE_TORSO_LEAN',
      'INCOMPLETE_OVERHEAD_EXTENSION',
      'INCOMPLETE_LOWERING',
      'LEFT_RIGHT_ASYMMETRY'
    ];

    for (const issue of currentIssues) {
      if (!this.issueTracker.has(issue.type)) {
        this.issueTracker.set(issue.type, { frames: 0, reported: false });
      }
      const tracker = this.issueTracker.get(issue.type)!;
      tracker.frames++;

      if (tracker.frames >= SHOULDER_PRESS_FORM_CONFIG.persistenceFrames) {
        if (!highestPriorityIssue) {
          highestPriorityIssue = issue;
        } else {
          const currentIdx = priorityList.indexOf(issue.type);
          const highestIdx = priorityList.indexOf(highestPriorityIssue.type);
          if (currentIdx !== -1 && (highestIdx === -1 || currentIdx < highestIdx)) {
            highestPriorityIssue = issue;
          }
        }
      }
    }

    const now = Date.now();
    if (highestPriorityIssue) {
      const tracker = this.issueTracker.get(highestPriorityIssue.type);
      if (tracker && !tracker.reported && (this.lastFeedbackTime === 0 || now - this.lastFeedbackTime > SHOULDER_PRESS_FORM_CONFIG.cooldownMs)) {
        this.currentFeedback = highestPriorityIssue.message;
        this.lastFeedbackTime = now;
        tracker.reported = true;
      }
    } else if (this.lastFeedbackTime > 0 && now - this.lastFeedbackTime > SHOULDER_PRESS_FORM_CONFIG.cooldownMs) {
      this.currentFeedback = null;
    }

    this.assessment.activeFeedback = this.currentFeedback;
    this.assessment.issues = currentIssues;
  }

  private calculateFormScore(): void {
    let score = 100;
    for (const issue of this.assessment.issues) {
      if (issue.type === 'LOW_CONFIDENCE') score -= 20;
      if (issue.type === 'EXCESSIVE_TORSO_LEAN') score -= 15;
      if (issue.type === 'LEFT_RIGHT_ASYMMETRY') score -= 5;
    }
    this.assessment.overallScore = Math.max(0, Math.min(100, score));
  }
}
