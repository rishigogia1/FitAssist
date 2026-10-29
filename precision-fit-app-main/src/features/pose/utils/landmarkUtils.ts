import { PoseLandmark } from '../types';

// MediaPipe BlazePose Connections (standard 33 landmarks)
export const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right Arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left Arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right Leg
  [24, 26], [26, 28], [28, 30], [28, 32], [32, 30],
  // Left Leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
];

export const VISIBILITY_THRESHOLD = 0.5;

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: PoseLandmark[],
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);
  
  if (!landmarks || landmarks.length === 0) return;

  // Draw connections
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00ff00';
  
  POSE_CONNECTIONS.forEach(([i, j]) => {
    const lm1 = landmarks[i];
    const lm2 = landmarks[j];
    
    if (
      lm1 && lm2 && 
      lm1.visibility > VISIBILITY_THRESHOLD && 
      lm2.visibility > VISIBILITY_THRESHOLD
    ) {
      ctx.beginPath();
      ctx.moveTo(lm1.x * width, lm1.y * height);
      ctx.lineTo(lm2.x * width, lm2.y * height);
      ctx.stroke();
    }
  });

  // Draw landmarks
  ctx.fillStyle = '#ff0000';
  landmarks.forEach((lm) => {
    if (lm.visibility > VISIBILITY_THRESHOLD) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}

// Distance between two normalized landmarks
export function calculateDistance(lm1: PoseLandmark, lm2: PoseLandmark): number {
  return Math.sqrt(Math.pow(lm1.x - lm2.x, 2) + Math.pow(lm1.y - lm2.y, 2) + Math.pow(lm1.z - lm2.z, 2));
}

// Angle between 3 landmarks (e.g. hip, knee, ankle)
export function calculateAngle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  return angle;
}
