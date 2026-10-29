// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PoseEngine } from './PoseEngine';
import { MediaPipePoseProvider } from './MediaPipePoseProvider';

// Mock MediaPipe
vi.mock('./MediaPipePoseProvider', () => {
  return {
    MediaPipePoseProvider: vi.fn().mockImplementation(function (this: any) {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        start: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn()
      };
    })
  };
});

describe('PoseEngine', () => {
  let engine: PoseEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock navigator.mediaDevices
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }]
        })
      },
      configurable: true
    });

    engine = new PoseEngine();
  });

  it('should initialize with IDLE state', () => {
    expect(engine.getState()).toBe('IDLE');
  });

  const startEngineWithMockVideo = async () => {
    const videoMock = document.createElement('video');
    videoMock.play = vi.fn().mockResolvedValue(undefined);
    const timer = setTimeout(() => {
      if (videoMock.onloadedmetadata) {
        (videoMock.onloadedmetadata as any)(new Event('loadedmetadata'));
      }
    }, 10);
    const startPromise = engine.start(videoMock);
    await startPromise;
    clearTimeout(timer);
    return videoMock;
  };

  it('should request camera permissions and start', async () => {
    await startEngineWithMockVideo();
    expect(engine.getState()).toBe('RUNNING');
  });

  it('should stop and clean up correctly', async () => {
    await startEngineWithMockVideo();
    expect(engine.getState()).toBe('RUNNING');

    engine.stop();
    expect(engine.getState()).toBe('STOPPED');
  });

  it('should destroy completely', async () => {
    await startEngineWithMockVideo();
    engine.destroy();
    expect(engine.getState()).toBe('STOPPED');
  });
});
