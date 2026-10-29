import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PoseProvider, PoseFrame } from '../types';

export class MediaPipePoseProvider implements PoseProvider {
  private poseLandmarker: PoseLandmarker | null = null;
  private runningMode: 'VIDEO' = 'VIDEO';
  private animationFrameId: number | null = null;
  private isRunning = false;
  private lastVideoTime = -1;

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    
    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU'
      },
      runningMode: this.runningMode,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  start(videoElement: HTMLVideoElement, onFrame: (frame: PoseFrame) => void): void {
    if (!this.poseLandmarker) {
      throw new Error('PoseLandmarker not initialized');
    }
    this.isRunning = true;
    
    const loop = (time: number) => {
      if (!this.isRunning) return;

      if (videoElement.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = videoElement.currentTime;
        const startTimeMs = performance.now();
        
        try {
          const results = this.poseLandmarker!.detectForVideo(videoElement, startTimeMs);
          const inferenceLatencyMs = performance.now() - startTimeMs;
          
          if (results.landmarks && results.landmarks.length > 0) {
            // Take the first person detected
            const mpLandmarks = results.landmarks[0];
            
            // Calculate a simple average confidence (visibility/presence)
            // MediaPipe tasks vision doesn't return a single confidence score easily, 
            // so we average visibility
            let totalVisibility = 0;
            const landmarks = mpLandmarks.map((lm, i) => {
              // Ensure visibility is a number
              const vis = typeof lm.visibility === 'number' ? lm.visibility : 1;
              totalVisibility += vis;
              return {
                id: i,
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: vis
              };
            });
            
            const confidence = landmarks.length > 0 ? totalVisibility / landmarks.length : 0;
            
            onFrame({
              timestamp: Date.now(),
              landmarks,
              confidence,
              inferenceLatencyMs
            });
          }
        } catch (error) {
          console.error("Inference error", error);
        }
      }
      
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy(): void {
    this.stop();
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
  }
}
