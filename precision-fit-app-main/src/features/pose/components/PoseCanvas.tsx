import { useEffect, useRef } from 'react';
import { PoseFrame } from '../types';
import { drawSkeleton } from '../utils/landmarkUtils';

interface PoseCanvasProps {
  width: number;
  height: number;
  frameRef: React.MutableRefObject<PoseFrame | null>;
  isRunning: boolean;
}

export function PoseCanvas({ width, height, frameRef, isRunning }: PoseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    if (!isRunning) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, width, height);
      }
      return;
    }

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas && frameRef.current) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawSkeleton(ctx, frameRef.current.landmarks, width, height);
        }
      }
      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isRunning, width, height, frameRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
    />
  );
}
