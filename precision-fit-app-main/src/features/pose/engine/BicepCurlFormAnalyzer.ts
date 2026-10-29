import {
  PoseFrame,
  ExerciseMetrics,
  FormAssessment,
  FormIssue,
  FormIssueType,
  RepFormAssessment
} from '../types';

export const BICEP_CURL_FORM_CONFIG = {
  confidenceThreshold: 0.5,
  minCurlThresholdDegrees: 75,       // Elbow must reach <= 75° for valid full curl
  fullExtensionThresholdDegrees: 140, // Return must reach >= 140° for full extension
  elbowDriftThreshold: 0.14,         // Max normalized X offset between elbow and shoulder
  torsoSwayThresholdDegrees: 15,     // Torso angle deviation
  asymmetryThresholdDegrees: 22,     // Max bilateral elbow discrepancy
  fastConcentricThresholdMs: 400,    // Too rapid curling jerk
  fastEccentricThresholdMs: 400,     // Dropping weight too fast
  cooldownMs: 2500,
  persistenceFrames: 3,
};

export class BicepCurlFormAnalyzer {
  private assessment: FormAssessment;
  private issueTracker: Map<FormIssueType, { frames: number; reported: boolean }> = new Map();
  private lastFeedbackTime = 0;
  private currentFeedback: string | null = null;
  private lastPhase = 'IDLE';

  private repAssessments: RepFormAssessment[] = [];

  // Running rep-level stats
  private repMinElbowAngle = 180;
  private repMaxReturnAngle = 0;
  private repMaxElbowDrift = 0;
  private repMaxTorsoSway = 0;
  private repMaxAsymmetry = 0;
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
    this.repMinElbowAngle = 180;
    this.repMaxReturnAngle = 0;
    this.repMaxElbowDrift = 0;
    this.repMaxTorsoSway = 0;
    this.repMaxAsymmetry = 0;
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
      elbowDrift?: number | null;
      torsoSway?: number | null;
      leftRightDiff?: number | null;
      isBothArmsVisible?: boolean;
    }
  ): void {
    this.assessment.timestamp = frame.timestamp;
    this.assessment.confidence = frame.confidence;

    const currentIssues: FormIssue[] = [];

    // 1. Low confidence check
    if (frame.confidence < BICEP_CURL_FORM_CONFIG.confidenceThreshold) {
      currentIssues.push({
        type: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        message: 'Move into clear camera view with your arms visible.'
      });
      this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
      return;
    }

    // 2. Track phase transitions & timing
    // In bicep curls: CONCENTRIC is curling up, BOTTOM is peak contraction, ECCENTRIC is lowering
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

    // 3. Collect active metrics during curling movement
    if (metrics.phase === 'CONCENTRIC' || metrics.phase === 'BOTTOM' || metrics.phase === 'ECCENTRIC') {
      const currentAngle = metrics.elbowAngle ?? 180;
      if (currentAngle < this.repMinElbowAngle) {
        this.repMinElbowAngle = currentAngle;
      }
      if (currentAngle > this.repMaxReturnAngle) {
        this.repMaxReturnAngle = currentAngle;
      }

      // Check Elbow Drift
      if (extraContext?.elbowDrift != null) {
        if (extraContext.elbowDrift > this.repMaxElbowDrift) {
          this.repMaxElbowDrift = extraContext.elbowDrift;
        }
        if (extraContext.elbowDrift > BICEP_CURL_FORM_CONFIG.elbowDriftThreshold) {
          currentIssues.push({
            type: 'EXCESSIVE_ELBOW_DRIFT',
            severity: 'WARNING',
            message: 'Keep your elbows pinned at your sides to isolate the biceps.',
            metric: extraContext.elbowDrift,
            threshold: BICEP_CURL_FORM_CONFIG.elbowDriftThreshold
          });
          this.repIssues.add('EXCESSIVE_ELBOW_DRIFT');
        }
      }

      // Check Torso Sway / Excessive Swing
      if (extraContext?.torsoSway != null) {
        if (extraContext.torsoSway > this.repMaxTorsoSway) {
          this.repMaxTorsoSway = extraContext.torsoSway;
        }
        if (extraContext.torsoSway > BICEP_CURL_FORM_CONFIG.torsoSwayThresholdDegrees) {
          currentIssues.push({
            type: 'EXCESSIVE_SWING',
            severity: 'WARNING',
            message: 'Keep your torso steady and avoid using momentum.',
            metric: extraContext.torsoSway,
            threshold: BICEP_CURL_FORM_CONFIG.torsoSwayThresholdDegrees
          });
          this.repIssues.add('EXCESSIVE_SWING');
        }
      }

      // Check Bilateral Asymmetry
      if (
        extraContext?.isBothArmsVisible &&
        extraContext.leftRightDiff != null &&
        extraContext.leftRightDiff > BICEP_CURL_FORM_CONFIG.asymmetryThresholdDegrees
      ) {
        if (extraContext.leftRightDiff > this.repMaxAsymmetry) {
          this.repMaxAsymmetry = extraContext.leftRightDiff;
        }
        currentIssues.push({
          type: 'LEFT_RIGHT_ASYMMETRY',
          severity: 'INFO',
          message: 'Curl evenly with both arms.',
          metric: extraContext.leftRightDiff,
          threshold: BICEP_CURL_FORM_CONFIG.asymmetryThresholdDegrees
        });
        this.repIssues.add('LEFT_RIGHT_ASYMMETRY');
      }
    }

    this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
    this.calculateFormScore();
  }

  private finalizeRep(metrics: ExerciseMetrics): void {
    const returnAngle = Math.max(this.repMaxReturnAngle, metrics.elbowAngle ?? 0);

    // Check for Incomplete Curl (didn't reach <= 75°)
    if (this.repMinElbowAngle > BICEP_CURL_FORM_CONFIG.minCurlThresholdDegrees) {
      this.repIssues.add('INCOMPLETE_CURL');
      this.forceFeedback('Curl higher toward your shoulders for full flexion.');
    }

    // Check for Incomplete Extension at bottom (< 140°)
    if (returnAngle < BICEP_CURL_FORM_CONFIG.fullExtensionThresholdDegrees) {
      this.repIssues.add('INCOMPLETE_EXTENSION');
      this.forceFeedback('Lower your arms to full extension between reps.');
    }

    // Pacing checks
    if (this.concentricDuration > 0 && this.concentricDuration < BICEP_CURL_FORM_CONFIG.fastConcentricThresholdMs) {
      this.repIssues.add('FAST_ASCENT');
      this.forceFeedback('Control the curl upward without jerking.');
    }

    if (this.eccentricDuration > 0 && this.eccentricDuration < BICEP_CURL_FORM_CONFIG.fastEccentricThresholdMs) {
      this.repIssues.add('FAST_DESCENT');
      this.forceFeedback('Lower the weight slowly under control.');
    }

    if (this.repIssues.size === 0) {
      this.forceFeedback('Good rep.');
    }

    // Calculate Rep Score
    let repScore = 100;
    if (this.repIssues.has('INCOMPLETE_CURL')) repScore -= 15;
    if (this.repIssues.has('INCOMPLETE_EXTENSION')) repScore -= 10;
    if (this.repIssues.has('EXCESSIVE_ELBOW_DRIFT')) repScore -= 15;
    if (this.repIssues.has('EXCESSIVE_SWING')) repScore -= 15;
    if (this.repIssues.has('LEFT_RIGHT_ASYMMETRY')) repScore -= 5;
    if (this.repIssues.has('FAST_ASCENT')) repScore -= 5;
    if (this.repIssues.has('FAST_DESCENT')) repScore -= 5;

    repScore = Math.max(0, Math.min(100, repScore));

    this.repAssessments.push({
      repNumber: metrics.reps ?? this.repAssessments.length + 1,
      formScore: repScore,
      issues: Array.from(this.repIssues),
      depth: null, // Bicep curl is not a depth exercise
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
      'EXCESSIVE_SWING',
      'EXCESSIVE_ELBOW_DRIFT',
      'INCOMPLETE_CURL',
      'INCOMPLETE_EXTENSION',
      'LEFT_RIGHT_ASYMMETRY'
    ];

    for (const issue of currentIssues) {
      if (!this.issueTracker.has(issue.type)) {
        this.issueTracker.set(issue.type, { frames: 0, reported: false });
      }
      const tracker = this.issueTracker.get(issue.type)!;
      tracker.frames++;

      if (tracker.frames >= BICEP_CURL_FORM_CONFIG.persistenceFrames) {
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
      if (tracker && !tracker.reported && (this.lastFeedbackTime === 0 || now - this.lastFeedbackTime > BICEP_CURL_FORM_CONFIG.cooldownMs)) {
        this.currentFeedback = highestPriorityIssue.message;
        this.lastFeedbackTime = now;
        tracker.reported = true;
      }
    } else if (this.lastFeedbackTime > 0 && now - this.lastFeedbackTime > BICEP_CURL_FORM_CONFIG.cooldownMs) {
      this.currentFeedback = null;
    }

    this.assessment.activeFeedback = this.currentFeedback;
    this.assessment.issues = currentIssues;
  }

  private calculateFormScore(): void {
    let score = 100;
    for (const issue of this.assessment.issues) {
      if (issue.type === 'LOW_CONFIDENCE') score -= 20;
      if (issue.type === 'EXCESSIVE_SWING') score -= 15;
      if (issue.type === 'EXCESSIVE_ELBOW_DRIFT') score -= 15;
      if (issue.type === 'LEFT_RIGHT_ASYMMETRY') score -= 5;
    }
    this.assessment.overallScore = Math.max(0, Math.min(100, score));
  }
}
