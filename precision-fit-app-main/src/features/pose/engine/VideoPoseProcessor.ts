import { PoseFrame, PoseProvider } from '../types';
import { MediaPipePoseProvider } from './MediaPipePoseProvider';

export class VideoPoseProcessor {
  private provider: PoseProvider;
  private videoElement: HTMLVideoElement | null = null;
  
  private onFrameCallback?: (frame: PoseFrame) => void;
  private onProgressCallback?: (progress: number) => void;
  private onCompleteCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;
  
  private isProcessing = false;
  private animationFrameId: number | null = null;

  constructor() {
    this.provider = new MediaPipePoseProvider();
  }

  setCallbacks(
    onFrame: (frame: PoseFrame) => void,
    onProgress: (progress: number) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ) {
    this.onFrameCallback = onFrame;
    this.onProgressCallback = onProgress;
    this.onCompleteCallback = onComplete;
    this.onErrorCallback = onError;
  }

  async processVideo(file: File) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this.videoElement = document.createElement('video');
      this.videoElement.src = URL.createObjectURL(file);
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) return;
        this.videoElement.onloadeddata = () => resolve();
        this.videoElement.onerror = () => reject(new Error('Failed to load video data'));
      });

      await this.provider.initialize();

      // Play video to process frames
      this.videoElement.playbackRate = 1.0; 
      
      this.provider.start(this.videoElement, (frame) => {
        this.onFrameCallback?.(frame);
      });
      
      const updateProgress = () => {
        if (!this.isProcessing || !this.videoElement) return;
        
        if (this.videoElement.duration) {
          const progress = (this.videoElement.currentTime / this.videoElement.duration) * 100;
          this.onProgressCallback?.(progress);
        }
        
        if (!this.videoElement.ended) {
          this.animationFrameId = requestAnimationFrame(updateProgress);
        }
      };

      this.videoElement.onended = () => {
        this.finishProcessing();
      };

      await this.videoElement.play();
      this.animationFrameId = requestAnimationFrame(updateProgress);

    } catch (error) {
      this.cancel();
      if (error instanceof Error) {
        this.onErrorCallback?.(error);
      } else {
        this.onErrorCallback?.(new Error(String(error)));
      }
    }
  }

  cancel() {
    if (!this.isProcessing) return;
    this.finishProcessing();
  }

  private finishProcessing() {
    this.isProcessing = false;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.provider.stop();
    
    if (this.videoElement) {
      this.videoElement.pause();
      if (this.videoElement.src) {
        URL.revokeObjectURL(this.videoElement.src);
      }
      this.videoElement.src = '';
      this.videoElement = null;
    }
    
    this.onCompleteCallback?.();
  }

  destroy() {
    this.cancel();
    this.provider.destroy();
    this.onFrameCallback = undefined;
    this.onProgressCallback = undefined;
    this.onCompleteCallback = undefined;
    this.onErrorCallback = undefined;
  }
}
