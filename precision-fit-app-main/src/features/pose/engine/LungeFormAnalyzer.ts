import { 
  PoseFrame, 
  ExerciseMetrics, 
  FormAssessment, 
  FormIssue, 
  FormIssueType, 
  RepFormAssessment 
} from '../types';

export const LUNGE_FORM_CONFIG = {
  confidenceThreshold: 0.55,
  minDepthThresholdDegrees: 100,      // Front knee must reach <= 100° for full depth
  fullExtensionThresholdDegrees: 155,  // Knees must return >= 155° to complete return
  torsoLeanThresholdDegrees: 70,       // Hip-to-shoulder angle should remain >= 70° upright
  kneeAsymmetryThresholdDegrees: 35,   // Unexpected disparity between legs when both visible
  fastDescentThresholdMs: 600,         // Descent faster than 600ms
  fastAscentThresholdMs: 400,          // Ascent faster than 400ms
  persistenceFrames: 4,                // Consecutive frames to confirm issue
  cooldownMs: 2500,                    // Minimum delay between UI feedback alerts
};

type TrackingIssue = { frames: number; reported: boolean };

/**
 * Dedicated form analyzer for Lunges.
 * Evaluates lunge depth, torso uprightness, complete return to standing, leg tracking, and rep pacing.
 * Observational feedback only without medical or injury diagnoses.
 */
export class LungeFormAnalyzer {
  private assessment: FormAssessment;

  // Real-time issue tracking & cooldowns
  private issueTracker: Map<FormIssueType, TrackingIssue> = new Map();
  private lastFeedbackTime = 0;
  private currentFeedback: string | null = null;
  private lastPhase = 'IDLE';

  private repAssessments: RepFormAssessment[] = [];

  // Running rep-level temporal stats
  private repMinKneeAngle = 180;
  private repMaxReturnAngle = 0;
  private repMinTorsoAngle = 180;
  private repMaxDepth = 0;
  private repIssues: Set<FormIssueType> = new Set();

  // Timers
  private eccentricStartTime = 0;
  private concentricStartTime = 0;
  private eccentricDuration = 0;
  private concentricDuration = 0;

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
    this.repMinKneeAngle = 180;
    this.repMaxReturnAngle = 0;
    this.repMinTorsoAngle = 180;
    this.repMaxDepth = 0;
    this.repIssues.clear();
    this.eccentricDuration = 0;
    this.concentricDuration = 0;
    this.eccentricStartTime = 0;
    this.concentricStartTime = 0;
  }

  getAssessment(): FormAssessment {
    return { ...this.assessment };
  }

  getRepAssessments(): RepFormAssessment[] {
    return [...this.repAssessments];
  }

  /**
   * Evaluates active lunge telemetry on each frame.
   */
  analyze(
    frame: PoseFrame, 
    metrics: ExerciseMetrics, 
    extraContext?: { 
      isTorsoLeaning?: boolean; 
      isKneeAsymmetric?: boolean;
      activeLegIdentified?: boolean;
    }
  ): void {
    this.assessment.timestamp = frame.timestamp;
    this.assessment.confidence = frame.confidence;

    const currentIssues: FormIssue[] = [];

    // 1. Confidence Gate
    if (frame.confidence < LUNGE_FORM_CONFIG.confidenceThreshold) {
      currentIssues.push({
        type: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        message: 'Ensure full body from head to feet is clearly visible.'
      });
      this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
      return;
    }

    // 2. Track Phase Changes & Rep Timers
    if (this.lastPhase !== metrics.phase) {
      if (metrics.phase === 'ECCENTRIC') {
        this.eccentricStartTime = frame.timestamp;
        this.resetRepMetrics();
      } else if (metrics.phase === 'BOTTOM' || metrics.phase === 'CONCENTRIC') {
        if (this.lastPhase === 'ECCENTRIC') {
          this.eccentricDuration = frame.timestamp - this.eccentricStartTime;
          this.concentricStartTime = frame.timestamp;
        }
      } else if (metrics.phase === 'STANDING' && this.lastPhase === 'CONCENTRIC') {
        this.concentricDuration = frame.timestamp - this.concentricStartTime;
        this.finalizeRep(metrics);
      }
      this.lastPhase = metrics.phase;
    }

    // 3. Movement Observations during descent, bottom, or ascent
    if (metrics.phase === 'ECCENTRIC' || metrics.phase === 'BOTTOM' || metrics.phase === 'CONCENTRIC') {
      const workingAngle = metrics.kneeAngle ?? 180;
      if (workingAngle < this.repMinKneeAngle) {
        this.repMinKneeAngle = workingAngle;
      }
      if (workingAngle > this.repMaxReturnAngle) {
        this.repMaxReturnAngle = workingAngle;
      }
      if (metrics.depth !== null && metrics.depth > this.repMaxDepth) {
        this.repMaxDepth = metrics.depth;
      }

      // Check Torso Lean
      if (extraContext?.isTorsoLeaning) {
        currentIssues.push({
          type: 'EXCESSIVE_FORWARD_LEAN',
          severity: 'WARNING',
          message: 'Keep your torso upright and shoulders stacked over hips.',
          metric: metrics.torsoAngle ?? undefined
        });
        this.repIssues.add('EXCESSIVE_FORWARD_LEAN');
      }

      // Check Knee Angle Asymmetry / Disparity
      if (extraContext?.isKneeAsymmetric) {
        currentIssues.push({
          type: 'KNEE_ANGLE_ASYMMETRY',
          severity: 'INFO',
          message: 'Focus on balanced knee tracking and stability.',
          metric: undefined
        });
        this.repIssues.add('KNEE_ANGLE_ASYMMETRY');
      }
    }

    this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
    this.calculateFormScore();
  }

  /**
   * Finalizes completed repetition metrics and records history.
   */
  private finalizeRep(metrics: ExerciseMetrics): void {
    // Insufficient Depth (didn't reach <= 100°)
    if (this.repMinKneeAngle > LUNGE_FORM_CONFIG.minDepthThresholdDegrees) {
      this.repIssues.add('INSUFFICIENT_DEPTH');
      this.forceFeedback('Lower your hips until your lead knee reaches about 90 degrees.');
    }

    // Incomplete Return to Standing (< 150°)
    if (this.repMaxReturnAngle < 150) {
      this.repIssues.add('INCOMPLETE_RETURN');
      this.forceFeedback('Push all the way back up to a full standing position.');
    }

    // Pacing checks
    if (this.eccentricDuration > 0 && this.eccentricDuration < LUNGE_FORM_CONFIG.fastDescentThresholdMs) {
      this.repIssues.add('FAST_DESCENT');
      this.forceFeedback('Control your step and descent on the way down.');
    }

    if (this.concentricDuration > 0 && this.concentricDuration < LUNGE_FORM_CONFIG.fastAscentThresholdMs) {
      this.repIssues.add('FAST_ASCENT');
      this.forceFeedback('Maintain steady, controlled power pushing back to standing.');
    }

    // Clean repetition feedback
    if (this.repIssues.size === 0) {
      this.forceFeedback('Good rep.');
    }

    // Calculate Rep Score
    let repScore = 100;
    if (this.repIssues.has('INSUFFICIENT_DEPTH')) repScore -= 15;
    if (this.repIssues.has('INCOMPLETE_RETURN')) repScore -= 10;
    if (this.repIssues.has('EXCESSIVE_FORWARD_LEAN')) repScore -= 15;
    if (this.repIssues.has('KNEE_ANGLE_ASYMMETRY')) repScore -= 5;
    if (this.repIssues.has('FAST_DESCENT')) repScore -= 5;
    if (this.repIssues.has('FAST_ASCENT')) repScore -= 5;

    repScore = Math.max(0, Math.min(100, repScore));

    this.repAssessments.push({
      repNumber: metrics.reps ?? this.repAssessments.length + 1,
      formScore: repScore,
      issues: Array.from(this.repIssues),
      depth: this.repMaxDepth > 0 ? this.repMaxDepth : null,
      rom: metrics.rangeOfMotion ?? null,
      leftRightDifference: Math.abs((metrics.leftKneeAngle || 0) - (metrics.rightKneeAngle || 0)),
      eccentricDurationMs: this.eccentricDuration,
      concentricDurationMs: this.concentricDuration,
    });
  }

  private forceFeedback(message: string): void {
    this.currentFeedback = message;
    this.lastFeedbackTime = Date.now();
  }

  private updateTrackerAndFeedback(currentIssues: FormIssue[], timestamp: number): void {
    // Decay issues that resolved
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
    const issuePriority: FormIssueType[] = [
      'LOW_CONFIDENCE',
      'EXCESSIVE_FORWARD_LEAN',
      'INSUFFICIENT_DEPTH',
      'INCOMPLETE_RETURN',
      'KNEE_ANGLE_ASYMMETRY',
      'FAST_DESCENT',
      'FAST_ASCENT'
    ];

    for (const issue of currentIssues) {
      if (!this.issueTracker.has(issue.type)) {
        this.issueTracker.set(issue.type, { frames: 0, reported: false });
      }
      const tracker = this.issueTracker.get(issue.type)!;
      tracker.frames++;

      if (tracker.frames >= LUNGE_FORM_CONFIG.persistenceFrames) {
        if (!highestPriorityIssue || issuePriority.indexOf(issue.type) < issuePriority.indexOf(highestPriorityIssue.type)) {
          highestPriorityIssue = issue;
        }
      }
    }

    // Cooldown-guarded feedback alert
    if (highestPriorityIssue) {
      const tracker = this.issueTracker.get(highestPriorityIssue.type)!;
      const isOffCooldown = this.lastFeedbackTime === 0 || (timestamp - this.lastFeedbackTime > LUNGE_FORM_CONFIG.cooldownMs);
      if (isOffCooldown && !tracker.reported) {
        this.currentFeedback = highestPriorityIssue.message;
        this.lastFeedbackTime = timestamp;
        tracker.reported = true;
      }
    } else if (this.lastFeedbackTime === 0 || timestamp - this.lastFeedbackTime > LUNGE_FORM_CONFIG.cooldownMs) {
      this.currentFeedback = null;
    }

    this.assessment.activeFeedback = this.currentFeedback;
    this.assessment.issues = currentIssues.filter(i => {
      const t = this.issueTracker.get(i.type);
      return t && t.frames >= LUNGE_FORM_CONFIG.persistenceFrames;
    });
  }

  private calculateFormScore(): void {
    let score = 100;
    for (const issue of this.assessment.issues) {
      switch (issue.type) {
        case 'EXCESSIVE_FORWARD_LEAN':
          score -= 15; break;
        case 'INSUFFICIENT_DEPTH':
          score -= 10; break;
        case 'KNEE_ANGLE_ASYMMETRY':
          score -= 5; break;
        case 'LOW_CONFIDENCE':
          score -= 5; break;
      }
    }

    // Smooth overall score
    this.assessment.overallScore = Math.round((0.2 * score) + (0.8 * this.assessment.overallScore));
    this.assessment.overallScore = Math.max(0, Math.min(100, this.assessment.overallScore));
  }
}
