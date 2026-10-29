export interface PoseLandmark {
  id: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: PoseLandmark[];
  confidence: number;
  inferenceLatencyMs: number;
}

export type PoseEngineState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR';

export interface PoseProvider {
  initialize(): Promise<void>;
  start(videoElement: HTMLVideoElement, onFrame: (frame: PoseFrame) => void): void;
  stop(): void;
  destroy(): void;
}

export type ExerciseType = 
  | 'UNKNOWN' 
  | 'SQUAT' 
  | 'PUSH_UP' 
  | 'LUNGE' 
  | 'BICEP_CURL' 
  | 'SHOULDER_PRESS' 
  | 'PLANK';

export type MovementPhase = 
  | 'IDLE' 
  | 'STANDING' 
  | 'TOP'
  | 'ECCENTRIC' 
  | 'BOTTOM' 
  | 'CONCENTRIC' 
  | 'HOLDING' 
  | 'RESTING';

export type LandmarkGroup = 
  | 'HEAD'
  | 'SHOULDERS'
  | 'ELBOWS'
  | 'WRISTS'
  | 'TORSO'
  | 'HIPS'
  | 'KNEES'
  | 'ANKLES'
  | 'FEET';

export type CameraViewRequirement = 
  | 'SAGITTAL'              // Side view (Sagittal plane)
  | 'FRONTAL'               // Front view (Coronal plane)
  | 'SAGITTAL_OR_FRONTAL'   // Either side or front view
  | 'ANY';                  // Any camera angle

export interface ExerciseDefinition {
  id: ExerciseType;
  name: string;
  isImplemented: boolean;
  isRepetitionBased: boolean;
  supportedMetrics: string[];
  requiredLandmarkGroups: LandmarkGroup[];
  cameraViewRequirement: CameraViewRequirement;
  cameraViewDescription?: string;
  description?: string;
}

export interface ExerciseMetrics {
  exercise: ExerciseType;
  phase: MovementPhase;
  reps: number | null; // null for duration-based exercises like Plank
  currentRep: number | null;
  holdDurationMs?: number | null; // Duration in ms for isometric holds (e.g. Plank)
  holdDurationSec?: number | null;

  // Joint Angles (measured in degrees, null when not measured or not applicable)
  kneeAngle: number | null;
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  hipAngle: number | null;
  leftHipAngle?: number | null;
  rightHipAngle?: number | null;

  // Upper Body Joint Angles
  elbowAngle?: number | null;
  leftElbowAngle?: number | null;
  rightElbowAngle?: number | null;
  shoulderAngle?: number | null;
  leftShoulderAngle?: number | null;
  rightShoulderAngle?: number | null;
  spineAngle?: number | null;

  // Arm & Unilateral Metrics
  activeArm?: 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN';

  // Lunge & Unilateral Metrics
  activeLeg?: 'LEFT' | 'RIGHT' | 'UNKNOWN';
  frontKneeAngle?: number | null;
  rearKneeAngle?: number | null;
  torsoAngle?: number | null;

  // Extensible joint angles map
  jointAngles?: Record<string, number | null>;

  rangeOfMotion: number | null;
  romPercent?: number | null;
  depth: number | null;
  repDurationMs: number | null;
  confidence: number;
  timestamp: number;
  inferenceLatencyMs?: number;

  // Landmark visibility assessment
  landmarkVisibility?: {
    isFullyVisible: boolean;
    missingLandmarks?: number[];
    missingGroups?: LandmarkGroup[];
  };
}

export type FormIssueType = 
  | 'INSUFFICIENT_DEPTH'
  | 'INCOMPLETE_EXTENSION'
  | 'INCOMPLETE_RETURN'
  | 'INCOMPLETE_CURL'
  | 'INCOMPLETE_OVERHEAD_EXTENSION'
  | 'INCOMPLETE_LOWERING'
  | 'KNEE_VALGUS'
  | 'EXCESSIVE_FORWARD_LEAN'
  | 'EXCESSIVE_TORSO_LEAN'
  | 'ASYMMETRIC_MOVEMENT'
  | 'KNEE_ANGLE_ASYMMETRY'
  | 'ELBOW_ASYMMETRY'
  | 'LEFT_RIGHT_ASYMMETRY'
  | 'FAST_DESCENT'
  | 'FAST_ASCENT'
  | 'UNSTABLE_MOVEMENT'
  | 'LOW_CONFIDENCE'
  | 'HIPS_SAGGING'
  | 'HIPS_PIKING'
  | 'ELBOW_FLARE'
  | 'ELBOW_DRIFT'
  | 'EXCESSIVE_ELBOW_DRIFT'
  | 'BODY_SWAY'
  | 'EXCESSIVE_SWING'
  | 'INCOMPLETE_LOCKOUT'
  | 'INCOMPLETE_RANGE_OF_MOTION'
  | 'LUMBAR_HYPEREXTENSION'
  | 'LANDMARK_OCCLUSION'
  | 'UNSUITABLE_CAMERA_ANGLE';

export interface FormIssue {
  type: FormIssueType;
  severity: 'INFO' | 'WARNING';
  message: string;
  metric?: number;
  threshold?: number;
}

export interface TemporalFormPrediction {
  status: 'HIGH' | 'UNCERTAIN' | 'MODEL_NOT_AVAILABLE';
  label?: FormIssueType | 'GOOD_FORM';
  confidence?: number;
  timestamp: number;
  modelVersion?: string;
  inferenceLatencyMs?: number;
}

export interface FormAssessment {
  overallScore: number;
  activeFeedback: string | null;
  issues: FormIssue[];
  confidence: number;
  timestamp: number;
  mlPrediction?: TemporalFormPrediction;
}

export interface RepFormAssessment {
  repNumber: number;
  formScore: number;
  issues: FormIssueType[];
  depth: number | null;
  rom: number | null;
  romPercent?: number | null;
  leftRightDifference: number;
  eccentricDurationMs: number;
  concentricDurationMs: number;
}
