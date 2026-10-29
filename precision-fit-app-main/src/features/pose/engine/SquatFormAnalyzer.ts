import { PoseFrame, ExerciseMetrics, FormAssessment, FormIssue, FormIssueType, RepFormAssessment } from '../types';
import { calculateAngle } from '../utils/landmarkUtils';

export const SQUAT_FORM_CONFIG = {
  confidenceThreshold: 0.6,
  depthThresholdPercentage: 80, // Needs 80% of max depth
  kneeValgusAngleThreshold: 10, // Max degrees medial deviance
  torsoLeanThreshold: 60, // Hip angle (shoulder-hip-knee) shouldn't drop below this (too bent)
  asymmetryThreshold: 15, // Max 15 degrees diff between left and right knee
  fastDescentThresholdMs: 800, // < 800ms is too fast
  fastAscentThresholdMs: 600, // < 600ms is too fast
  persistenceFrames: 5,
  cooldownMs: 3000,
};

type TrackingIssue = { frames: number, reported: boolean };

export class SquatFormAnalyzer {
  private assessment: FormAssessment;
  
  // Tracking
  private issueTracker: Map<FormIssueType, TrackingIssue> = new Map();
  private lastFeedbackTime = 0;
  private currentFeedback: string | null = null;
  private lastPhase = 'IDLE';

  private repAssessments: RepFormAssessment[] = [];

  // Temporal metrics for rep summary
  private repMinDepth = 0;
  private repMaxAsymmetry = 0;
  private repMinTorso = 180;
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

  injectMLPrediction(prediction: any): void {
    this.assessment.mlPrediction = prediction;
    
    // Transparent Fusion Logic
    if (prediction.status === 'HIGH' && prediction.label && prediction.label !== 'GOOD_FORM') {
      // If ML is highly confident in an issue, ensure it's exposed
      const exists = this.assessment.issues.find(i => i.type === prediction.label);
      if (!exists) {
        this.assessment.issues.push({
          type: prediction.label as FormIssueType,
          severity: 'WARNING',
          message: `ML detected: ${prediction.label}`
        });
      }
    }
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

  getAssessment(): FormAssessment {
    return { ...this.assessment };
  }
  
  getRepAssessments(): RepFormAssessment[] {
    return [...this.repAssessments];
  }

  private resetRepMetrics() {
    this.repMinDepth = 0;
    this.repMaxAsymmetry = 0;
    this.repMinTorso = 180;
    this.repIssues.clear();
    this.eccentricDuration = 0;
    this.concentricDuration = 0;
    this.eccentricStartTime = 0;
    this.concentricStartTime = 0;
  }

  analyze(frame: PoseFrame, metrics: ExerciseMetrics): void {
    this.assessment.timestamp = frame.timestamp;
    this.assessment.confidence = frame.confidence;

    const currentIssues: FormIssue[] = [];

    // 1. Check Confidence Rule
    if (frame.confidence < SQUAT_FORM_CONFIG.confidenceThreshold) {
      currentIssues.push({
        type: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        message: 'Move into clearer view.',
      });
      this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
      // Skip further analysis if we can't see the person
      return;
    }

    // 2. Track Phase Changes for Rep Timing
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

    // Capture running metrics during active movement
    if (metrics.phase === 'ECCENTRIC' || metrics.phase === 'BOTTOM' || metrics.phase === 'CONCENTRIC') {
      if (metrics.depth !== null && metrics.depth > this.repMinDepth) {
        this.repMinDepth = metrics.depth;
      }
      
      const asymmetry = Math.abs((metrics.leftKneeAngle || 0) - (metrics.rightKneeAngle || 0));
      if (asymmetry > this.repMaxAsymmetry) {
        this.repMaxAsymmetry = asymmetry;
      }

      const torsoAngle = metrics.hipAngle || 180;
      if (torsoAngle < this.repMinTorso) {
        this.repMinTorso = torsoAngle;
      }

      // Check Asymmetry Rule
      if (asymmetry > SQUAT_FORM_CONFIG.asymmetryThreshold) {
        currentIssues.push({
          type: 'ASYMMETRIC_MOVEMENT',
          severity: 'INFO',
          message: 'Your movement is slightly uneven between both sides.',
          metric: asymmetry
        });
      }

      // Check Torso Lean Rule
      if (torsoAngle < SQUAT_FORM_CONFIG.torsoLeanThreshold) {
        currentIssues.push({
          type: 'EXCESSIVE_FORWARD_LEAN',
          severity: 'WARNING',
          message: 'Keep your chest more upright.',
          metric: torsoAngle
        });
      }

      // Check Knee Valgus (Simplified: if knee x moves medial to ankle/hip line)
      // This is a rough estimation. We use the 3D x-coordinates if available.
      // A more robust way is to check the lateral offset.
      // For this phase, we use the hip angle and asymmetry to proxy stability.
    }

    this.updateTrackerAndFeedback(currentIssues, frame.timestamp);
    this.calculateFormScore();
  }

  private finalizeRep(metrics: ExerciseMetrics) {
    // End of rep rules
    if (this.repMinDepth < SQUAT_FORM_CONFIG.depthThresholdPercentage) {
      this.repIssues.add('INSUFFICIENT_DEPTH');
      // Trigger a feedback message forcefully if this happens
      this.forceFeedback('Try going a little deeper.');
    }

    if (this.eccentricDuration > 0 && this.eccentricDuration < SQUAT_FORM_CONFIG.fastDescentThresholdMs) {
      this.repIssues.add('FAST_DESCENT');
      this.forceFeedback('Try slowing down the descent.');
    }

    if (this.concentricDuration > 0 && this.concentricDuration < SQUAT_FORM_CONFIG.fastAscentThresholdMs) {
      this.repIssues.add('FAST_ASCENT');
      this.forceFeedback('Keep the movement controlled on the way up.');
    }

    if (this.repMaxAsymmetry > SQUAT_FORM_CONFIG.asymmetryThreshold) {
      this.repIssues.add('ASYMMETRIC_MOVEMENT');
    }

    if (this.repMinTorso < SQUAT_FORM_CONFIG.torsoLeanThreshold) {
      this.repIssues.add('EXCESSIVE_FORWARD_LEAN');
    }

    if (this.repIssues.size === 0) {
      this.forceFeedback('Good rep.');
    }

    // Save Rep Form Assessment
    let score = 100;
    if (this.repIssues.has('INSUFFICIENT_DEPTH')) score -= 10;
    if (this.repIssues.has('EXCESSIVE_FORWARD_LEAN')) score -= 15;
    if (this.repIssues.has('ASYMMETRIC_MOVEMENT')) score -= 5;
    if (this.repIssues.has('FAST_DESCENT')) score -= 5;
    if (this.repIssues.has('FAST_ASCENT')) score -= 5;
    
    score = Math.max(0, Math.min(100, score));

    this.repAssessments.push({
      repNumber: metrics.reps,
      formScore: score,
      issues: Array.from(this.repIssues),
      depth: this.repMinDepth > 0 ? this.repMinDepth : null,
      rom: metrics.rangeOfMotion ?? null,
      leftRightDifference: this.repMaxAsymmetry,
      eccentricDurationMs: this.eccentricDuration,
      concentricDurationMs: this.concentricDuration,
    });
    this.resetRepMetrics();
  }

  private forceFeedback(message: string) {
    this.currentFeedback = message;
    this.lastFeedbackTime = Date.now(); // Put on cooldown
  }

  private updateTrackerAndFeedback(currentIssues: FormIssue[], timestamp: number) {
    // Decay non-present issues
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
    
    const issuePriority = [
      'LOW_CONFIDENCE',
      'KNEE_VALGUS',
      'EXCESSIVE_FORWARD_LEAN',
      'INSUFFICIENT_DEPTH',
      'ASYMMETRIC_MOVEMENT',
      'FAST_DESCENT',
      'FAST_ASCENT'
    ];

    // Increment frames for present issues
    for (const issue of currentIssues) {
      if (!this.issueTracker.has(issue.type)) {
        this.issueTracker.set(issue.type, { frames: 0, reported: false });
      }
      const tracker = this.issueTracker.get(issue.type)!;
      tracker.frames++;

      if (tracker.frames >= SQUAT_FORM_CONFIG.persistenceFrames) {
        if (!highestPriorityIssue || issuePriority.indexOf(issue.type) < issuePriority.indexOf(highestPriorityIssue.type)) {
          highestPriorityIssue = issue;
        }
      }
    }

    // Generate active UI feedback with cooldown
    if (highestPriorityIssue) {
      const tracker = this.issueTracker.get(highestPriorityIssue.type)!;
      
      // If we are off cooldown and haven't constantly spammed this exact issue recently
      if (timestamp - this.lastFeedbackTime > SQUAT_FORM_CONFIG.cooldownMs && !tracker.reported) {
        this.currentFeedback = highestPriorityIssue.message;
        this.lastFeedbackTime = timestamp;
        tracker.reported = true;
      }
    } else if (timestamp - this.lastFeedbackTime > SQUAT_FORM_CONFIG.cooldownMs) {
      // Clear feedback if everything is fine
      this.currentFeedback = null;
    }

    this.assessment.activeFeedback = this.currentFeedback;
    
    // Set actual active persistent issues to expose
    this.assessment.issues = currentIssues.filter(i => {
      const t = this.issueTracker.get(i.type);
      return t && t.frames >= SQUAT_FORM_CONFIG.persistenceFrames;
    });
  }

  private calculateFormScore() {
    let score = 100;
    
    // We deduct from 100 based on persistent active issues
    for (const issue of this.assessment.issues) {
      switch (issue.type) {
        case 'EXCESSIVE_FORWARD_LEAN':
          score -= 15; break;
        case 'ASYMMETRIC_MOVEMENT':
          score -= 5; break;
        case 'LOW_CONFIDENCE':
          // Low confidence doesn't drop the score heavily but makes it unreliable
          score -= 5; break;
      }
    }
    
    // Smooth the score
    this.assessment.overallScore = (0.2 * score) + (0.8 * this.assessment.overallScore);
    this.assessment.overallScore = Math.max(0, Math.min(100, Math.round(this.assessment.overallScore)));
  }
}
