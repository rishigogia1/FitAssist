import { 
  PoseFrame, 
  ExerciseMetrics, 
  FormAssessment, 
  FormIssue, 
  FormIssueType, 
  RepFormAssessment 
} from '../types';

export const PUSH_UP_FORM_CONFIG = {
  confidenceThreshold: 0.55,
  minDepthThresholdDegrees: 95, // Elbow angle must reach <= 95° for full depth
  fullExtensionThresholdDegrees: 150, // Elbows must return >= 150°
  hipSaggingAngleThreshold: 155, // Body line angle < 155° with hips sagging
  hipPikingAngleThreshold: 155,  // Body line angle < 155° with hips piking
  asymmetryThresholdDegrees: 20, // Max diff between left and right elbow
  fastDescentThresholdMs: 600,   // Descent faster than 600ms
  fastAscentThresholdMs: 400,    // Ascent faster than 400ms
  persistenceFrames: 4,          // Number of frames an issue must persist
  cooldownMs: 2500,              // Minimum time between feedback changes
};

type TrackingIssue = { frames: number; reported: boolean };

/**
 * Dedicated form analyzer for Push-ups.
 * Analyzes body alignment (sagging/piking), elbow depth, extension, asymmetry, and rep pacing.
 * All feedback is purely observational without medical or injury diagnoses.
 */
export class PushUpFormAnalyzer {
  private assessment: FormAssessment;
  
  // Real-time issue tracking & debouncing
  private issueTracker: Map<FormIssueType, TrackingIssue> = new Map();
  private lastFeedbackTime = 0;
  private currentFeedback: string | null = null;
  private lastPhase = 'IDLE';

  private repAssessments: RepFormAssessment[] = [];

  // Running rep-level temporal stats
  private repMinElbowAngle = 180;
  private repMaxTopElbowAngle = 0;
  private repMaxDepth = 0;
  private repMaxAsymmetry = 0;
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
    this.repMinElbowAngle = 180;
    this.repMaxTopElbowAngle = 0;
    this.repMaxDepth = 0;
    this.repMaxAsymmetry = 0;
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
   * Process a frame and update live feedback and form score.
   */
  analyze(
    frame: PoseFrame, 
    metrics: ExerciseMetrics, 
    extraContext?: { 
      isSagging?: boolean; 
      isPiking?: boolean; 
      leftRightDiff?: number | null; 
      isBothArmsVisible?: boolean; 
    }
  ): void {
    this.assessment.timestamp = frame.timestamp;
    this.assessment.confidence = frame.confidence;

    const currentIssues: FormIssue[] = [];

    // 1. Low Confidence Gate
    if (frame.confidence < PUSH_UP_FORM_CONFIG.confidenceThreshold) {
      currentIssues.push({
        type: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        message: 'Move into clearer view of the camera.'
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
      } else if ((metrics.phase === 'TOP' || metrics.phase === 'STANDING') && this.lastPhase === 'CONCENTRIC') {
        this.concentricDuration = frame.timestamp - this.concentricStartTime;
        this.finalizeRep(metrics);
      }
      this.lastPhase = metrics.phase;
    }

    // 3. Collect active metrics during movement
    if (metrics.phase === 'ECCENTRIC' || metrics.phase === 'BOTTOM' || metrics.phase === 'CONCENTRIC') {
      const currentAngle = metrics.elbowAngle ?? 180;
      if (currentAngle < this.repMinElbowAngle) {
        this.repMinElbowAngle = currentAngle;
      }
      if (currentAngle > this.repMaxTopElbowAngle) {
        this.repMaxTopElbowAngle = currentAngle;
      }
      if (metrics.depth !== null && metrics.depth > this.repMaxDepth) {
        this.repMaxDepth = metrics.depth;
      }

      // Check Body Alignment: Hips Sagging
      if (extraContext?.isSagging) {
        currentIssues.push({
          type: 'HIPS_SAGGING',
          severity: 'WARNING',
          message: 'Engage your core to prevent your hips from sagging.',
          metric: metrics.hipAngle ?? undefined
        });
        this.repIssues.add('HIPS_SAGGING');
      }

      // Check Body Alignment: Hips Piking
      if (extraContext?.isPiking) {
        currentIssues.push({
          type: 'HIPS_PIKING',
          severity: 'WARNING',
          message: 'Lower your hips into a straight plank line.',
          metric: metrics.hipAngle ?? undefined
        });
        this.repIssues.add('HIPS_PIKING');
      }

      // Check Asymmetry (only when both sides are verified visible)
      if (
        extraContext?.isBothArmsVisible && 
        extraContext.leftRightDiff != null && 
        extraContext.leftRightDiff > PUSH_UP_FORM_CONFIG.asymmetryThresholdDegrees
      ) {
        if (extraContext.leftRightDiff > this.repMaxAsymmetry) {
          this.repMaxAsymmetry = extraContext.leftRightDiff;
        }
        currentIssues.push({
          type: 'ASYMMETRIC_MOVEMENT',
          severity: 'INFO',
          message: 'Press evenly through both arms.',
          metric: extraContext.leftRightDiff
        });
        this.repIssues.add('ASYMMETRIC_MOVEMENT');
      }
    }

    this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
    this.calculateFormScore();
  }

  /**
   * Evaluates completion of a rep and scores its overall form.
   */
  private finalizeRep(metrics: ExerciseMetrics): void {
    // Check for Insufficient Depth (< 95°)
    if (this.repMinElbowAngle > PUSH_UP_FORM_CONFIG.minDepthThresholdDegrees) {
      this.repIssues.add('INSUFFICIENT_DEPTH');
      this.forceFeedback('Try lowering your chest a little deeper.');
    }

    // Check for Incomplete Extension at top (< 150°)
    if (this.repMaxTopElbowAngle < PUSH_UP_FORM_CONFIG.fullExtensionThresholdDegrees) {
      this.repIssues.add('INCOMPLETE_EXTENSION');
      this.forceFeedback('Push all the way up to full arm extension.');
    }

    // Check Descent Pacing
    if (this.eccentricDuration > 0 && this.eccentricDuration < PUSH_UP_FORM_CONFIG.fastDescentThresholdMs) {
      this.repIssues.add('FAST_DESCENT');
      this.forceFeedback('Control your descent on the way down.');
    }

    // Check Ascent Pacing
    if (this.concentricDuration > 0 && this.concentricDuration < PUSH_UP_FORM_CONFIG.fastAscentThresholdMs) {
      this.repIssues.add('FAST_ASCENT');
      this.forceFeedback('Maintain smooth, steady pacing on the way up.');
    }

    // Positive reinforcement for flawless reps
    if (this.repIssues.size === 0) {
      this.forceFeedback('Good rep.');
    }

    // Score deduction calculation
    let repScore = 100;
    if (this.repIssues.has('INSUFFICIENT_DEPTH')) repScore -= 15;
    if (this.repIssues.has('INCOMPLETE_EXTENSION')) repScore -= 10;
    if (this.repIssues.has('HIPS_SAGGING')) repScore -= 15;
    if (this.repIssues.has('HIPS_PIKING')) repScore -= 10;
    if (this.repIssues.has('ASYMMETRIC_MOVEMENT')) repScore -= 5;
    if (this.repIssues.has('FAST_DESCENT')) repScore -= 5;
    if (this.repIssues.has('FAST_ASCENT')) repScore -= 5;

    repScore = Math.max(0, Math.min(100, repScore));

    this.repAssessments.push({
      repNumber: metrics.reps ?? this.repAssessments.length + 1,
      formScore: repScore,
      issues: Array.from(this.repIssues),
      depth: this.repMaxDepth > 0 ? this.repMaxDepth : null,
      rom: metrics.rangeOfMotion ?? null,
      leftRightDifference: Math.round(this.repMaxAsymmetry),
      eccentricDurationMs: this.eccentricDuration,
      concentricDurationMs: this.concentricDuration,
    });
  }

  private forceFeedback(message: string): void {
    this.currentFeedback = message;
    this.lastFeedbackTime = Date.now();
  }

  private updateTrackerAndFeedback(currentIssues: FormIssue[], timestamp: number): void {
    // Decay inactive issues
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
      'HIPS_SAGGING',
      'HIPS_PIKING',
      'INSUFFICIENT_DEPTH',
      'INCOMPLETE_EXTENSION',
      'ASYMMETRIC_MOVEMENT',
      'FAST_DESCENT',
      'FAST_ASCENT'
    ];

    for (const issue of currentIssues) {
      if (!this.issueTracker.has(issue.type)) {
        this.issueTracker.set(issue.type, { frames: 0, reported: false });
      }
      const tracker = this.issueTracker.get(issue.type)!;
      tracker.frames++;

      if (tracker.frames >= PUSH_UP_FORM_CONFIG.persistenceFrames) {
        if (!highestPriorityIssue || issuePriority.indexOf(issue.type) < issuePriority.indexOf(highestPriorityIssue.type)) {
          highestPriorityIssue = issue;
        }
      }
    }

    // Emit feedback on cooldown
    if (highestPriorityIssue) {
      const tracker = this.issueTracker.get(highestPriorityIssue.type)!;
      const isOffCooldown = this.lastFeedbackTime === 0 || (timestamp - this.lastFeedbackTime > PUSH_UP_FORM_CONFIG.cooldownMs);
      if (isOffCooldown && !tracker.reported) {
        this.currentFeedback = highestPriorityIssue.message;
        this.lastFeedbackTime = timestamp;
        tracker.reported = true;
      }
    } else if (this.lastFeedbackTime === 0 || timestamp - this.lastFeedbackTime > PUSH_UP_FORM_CONFIG.cooldownMs) {
      this.currentFeedback = null;
    }

    this.assessment.activeFeedback = this.currentFeedback;
    this.assessment.issues = currentIssues.filter(i => {
      const t = this.issueTracker.get(i.type);
      return t && t.frames >= PUSH_UP_FORM_CONFIG.persistenceFrames;
    });
  }

  private calculateFormScore(): void {
    let score = 100;
    for (const issue of this.assessment.issues) {
      switch (issue.type) {
        case 'HIPS_SAGGING':
          score -= 15; break;
        case 'HIPS_PIKING':
          score -= 10; break;
        case 'INSUFFICIENT_DEPTH':
          score -= 10; break;
        case 'ASYMMETRIC_MOVEMENT':
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
