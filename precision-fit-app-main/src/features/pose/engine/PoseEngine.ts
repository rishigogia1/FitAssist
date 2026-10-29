import { PoseEngineState, PoseFrame, PoseProvider } from '../types';
import { MediaPipePoseProvider } from './MediaPipePoseProvider';

export class PoseEngine {
  private provider: PoseProvider;
  private state: PoseEngineState = 'IDLE';
  private videoElement: HTMLVideoElement | null = null;
  private mediaStream: MediaStream | null = null;
  
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;
  
  private onStateChangeCallback?: (state: PoseEngineState) => void;
  private onFrameCallback?: (frame: PoseFrame, fps: number) => void;
  private onErrorCallback?: (error: Error) => void;

  constructor() {
    this.provider = new MediaPipePoseProvider();
  }

  setCallbacks(
    onStateChange: (state: PoseEngineState) => void,
    onFrame: (frame: PoseFrame, fps: number) => void,
    onError: (error: Error) => void
  ) {
    this.onStateChangeCallback = onStateChange;
    this.onFrameCallback = onFrame;
    this.onErrorCallback = onError;
  }

  private setState(newState: PoseEngineState) {
    this.state = newState;
    this.onStateChangeCallback?.(newState);
  }

  getState(): PoseEngineState {
    return this.state;
  }

  async start(videoElement: HTMLVideoElement) {
    if (this.state === 'RUNNING' || this.state === 'INITIALIZING' || this.state === 'REQUESTING_PERMISSION') {
      return; // Idempotent
    }

    this.videoElement = videoElement;
    
    try {
      this.setState('REQUESTING_PERMISSION');
      
      // Request camera
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      this.videoElement.srcObject = this.mediaStream;
      
      // Wait for video to be ready to play
      await new Promise<void>((resolve) => {
        if (!this.videoElement) return;
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play();
          resolve();
        };
      });

      this.setState('INITIALIZING');
      await this.provider.initialize();
      
      this.setState('READY');
      
      this.lastFpsTime = performance.now();
      this.frameCount = 0;
      
      this.provider.start(this.videoElement, (frame) => {
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
          this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
          this.frameCount = 0;
          this.lastFpsTime = now;
        }
        
        this.onFrameCallback?.(frame, this.currentFps);
      });
      
      this.setState('RUNNING');
      
    } catch (error) {
      this.stop();
      this.setState('ERROR');
      if (error instanceof Error) {
        this.onErrorCallback?.(error);
      } else {
        this.onErrorCallback?.(new Error(String(error)));
      }
    }
  }

  stop() {
    if (this.state === 'STOPPED' || this.state === 'IDLE') return;
    
    this.setState('STOPPING');
    
    this.provider.stop();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    
    this.setState('STOPPED');
  }

  destroy() {
    this.stop();
    this.provider.destroy();
    this.onStateChangeCallback = undefined;
    this.onFrameCallback = undefined;
    this.onErrorCallback = undefined;
  }
}
