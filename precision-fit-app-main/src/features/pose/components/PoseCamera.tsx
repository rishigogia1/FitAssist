import { useRef, useEffect, useState } from 'react';
import { usePoseEstimation } from '../hooks/usePoseEstimation';
import { PoseCanvas } from './PoseCanvas';
import { Camera, StopCircle, AlertCircle, Activity, Info } from 'lucide-react';
import { ExerciseRegistry } from '../engine/ExerciseRegistry';
import { ExerciseType } from '../types';

export function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { 
    state, 
    error, 
    start, 
    stop, 
    resetAnalyzer, 
    frameRef, 
    metrics, 
    exerciseMetrics, 
    formAssessment,
    selectedExercise,
    setExercise 
  } = usePoseEstimation();
  const [containerSize, setContainerSize] = useState({ width: 640, height: 480 });
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDef = ExerciseRegistry.getDefinition(selectedExercise);

  useEffect(() => {
    // Basic resize observer to keep canvas matching video aspect
    const updateSize = () => {
      if (videoRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setContainerSize({ width: clientWidth, height: clientHeight });
      }
    };
    
    window.addEventListener('resize', updateSize);
    // Initial size
    setTimeout(updateSize, 100);
    
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleStart = () => {
    if (videoRef.current) {
      start(videoRef.current);
    }
  };

  const handleStop = () => {
    stop();
  };

  // Ensure cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            FitAssist Pro <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-1 rounded-full">Phase 1</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time on-device pose estimation.</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <div className="flex flex-col min-w-[160px]">
            <label htmlFor="pose-camera-exercise-select" className="text-xs text-muted-foreground font-medium mb-1">
              Select Exercise
            </label>
            <select
              id="pose-camera-exercise-select"
              value={selectedExercise}
              onChange={(e) => setExercise(e.target.value as ExerciseType)}
              className="p-2 bg-background border border-border rounded-md text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
              disabled={state === 'RUNNING'}
            >
              {ExerciseRegistry.getAllDefinitions().map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name} {!def.isImplemented ? '(Coming Soon)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            {state !== 'RUNNING' && state !== 'INITIALIZING' && state !== 'REQUESTING_PERMISSION' ? (
              <button 
                onClick={handleStart}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Start Camera
              </button>
            ) : (
              <button 
                onClick={handleStop}
                className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-destructive/90 transition-colors"
              >
                <StopCircle className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unimplemented Exercise Notice */}
      {!selectedDef.isImplemented && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 p-3 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Analysis for this exercise is coming soon.</span>
          </div>
          <span className="text-xs bg-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
            Registry Initialized
          </span>
        </div>
      )}

      {/* Recommended Camera View Tip */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Info className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>
          <strong>Recommended View:</strong> {selectedDef.cameraViewDescription}
        </span>
      </div>

      <div 
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] border border-border shadow-sm flex items-center justify-center"
      >
        {/* State Overlays */}
        {state === 'IDLE' || state === 'STOPPED' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 bg-black/50 z-10">
            <Camera className="w-12 h-12 mb-4 opacity-50" />
            <p>Camera is inactive.</p>
            <p className="text-sm opacity-75 mt-2">Privacy Note: All video processing happens locally on your device.</p>
          </div>
        ) : null}

        {state === 'REQUESTING_PERMISSION' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 bg-black/50 z-10">
            <div className="animate-pulse">Requesting camera permission...</div>
          </div>
        )}

        {state === 'INITIALIZING' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 bg-black/50 z-10">
            <div className="animate-pulse">Loading AI Pose Model...</div>
          </div>
        )}

        {state === 'ERROR' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive bg-black/80 z-10 p-6 text-center">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p className="font-bold">Failed to start pose detection</p>
            <p className="text-sm mt-2 opacity-90">{error?.message || 'Unknown error occurred'}</p>
            <button 
              onClick={handleStart}
              className="mt-6 border border-destructive px-4 py-2 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* The actual video element */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }} // Mirror effect for user-facing camera
        />
        
        {/* The skeleton overlay */}
        <div className="absolute inset-0 z-0" style={{ transform: 'scaleX(-1)' }}>
          <PoseCanvas 
            width={containerSize.width} 
            height={containerSize.height} 
            frameRef={frameRef}
            isRunning={state === 'RUNNING'}
          />
        </div>
        
        {/* Exercise Diagnostics Panel (Top Left) */}
        {state === 'RUNNING' && exerciseMetrics && (
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            <div className="bg-black/60 px-4 py-3 rounded-lg backdrop-blur-md border border-white/10 text-white min-w-[220px]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-white/60 font-semibold uppercase tracking-wider">Exercise</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ExerciseRegistry.isImplemented(exerciseMetrics.exercise) ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-300'}`}>
                  {ExerciseRegistry.getDefinition(exerciseMetrics.exercise).name}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-white/60 font-semibold uppercase tracking-wider">Phase</span>
                <span className="text-sm font-medium">{exerciseMetrics.phase}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs text-white/60 font-semibold uppercase tracking-wider">
                  {exerciseMetrics.reps !== null ? 'Reps' : 'Hold Time'}
                </span>
                <span className="text-2xl font-black text-primary">
                  {exerciseMetrics.reps !== null
                    ? String(exerciseMetrics.reps).padStart(2, '0')
                    : exerciseMetrics.holdDurationMs != null
                    ? `${(exerciseMetrics.holdDurationMs / 1000).toFixed(1)}s`
                    : '--'}
                </span>
              </div>
              
              {formAssessment && (
                <div className="mb-4 pt-3 border-t border-white/10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-white/60 font-semibold uppercase tracking-wider">Form Score</span>
                    <span className="font-mono font-bold">
                      {formAssessment.overallScore > 0 ? `${Math.round(formAssessment.overallScore)}/100` : 'N/A'}
                    </span>
                  </div>
                  
                  {formAssessment.activeFeedback && (
                    <div className="mt-2 text-xs bg-white/10 p-2 rounded border-l-2 border-primary">
                      ⚠️ {formAssessment.activeFeedback}
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-1 pt-3 border-t border-white/10">
                {/* For depth-based exercises (Squat, Push-up, Lunge) show Depth % */}
                {(exerciseMetrics.exercise === 'SQUAT' || exerciseMetrics.exercise === 'PUSH_UP' || exerciseMetrics.exercise === 'LUNGE') && 
                  exerciseMetrics.depth !== undefined && exerciseMetrics.depth !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Depth</span>
                    <span className="font-mono">{exerciseMetrics.depth}%</span>
                  </div>
                )}
                
                {/* For ROM-based exercises (Bicep Curl, Shoulder Press) show Range of Motion % */}
                {(exerciseMetrics.exercise === 'BICEP_CURL' || exerciseMetrics.exercise === 'SHOULDER_PRESS') && 
                  exerciseMetrics.romPercent !== undefined && exerciseMetrics.romPercent !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Range of Motion</span>
                    <span className="font-mono">{exerciseMetrics.romPercent}%</span>
                  </div>
                )}

                {/* Angular ROM in degrees if available */}
                {exerciseMetrics.rangeOfMotion !== undefined && exerciseMetrics.rangeOfMotion !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Angular ROM</span>
                    <span className="font-mono">{exerciseMetrics.rangeOfMotion}°</span>
                  </div>
                )}

                {/* Bicep Curl Active Arm */}
                {exerciseMetrics.exercise === 'BICEP_CURL' && exerciseMetrics.activeArm && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Active Arm</span>
                    <span className="font-mono font-semibold text-primary">
                      {exerciseMetrics.activeArm === 'LEFT' ? 'Left' : exerciseMetrics.activeArm === 'RIGHT' ? 'Right' : exerciseMetrics.activeArm === 'BOTH' ? 'Both Arms' : 'Detecting...'}
                    </span>
                  </div>
                )}

                {/* Shoulder Press Arm Elevation */}
                {exerciseMetrics.exercise === 'SHOULDER_PRESS' && exerciseMetrics.shoulderAngle != null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Arm Elevation</span>
                    <span className="font-mono">{exerciseMetrics.shoulderAngle}°</span>
                  </div>
                )}

                {/* Lunge Active Leg & Lead Knee */}
                {exerciseMetrics.exercise === 'LUNGE' && exerciseMetrics.activeLeg && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Active Leg</span>
                    <span className="font-mono font-semibold text-primary">
                      {exerciseMetrics.activeLeg === 'LEFT' ? 'Left' : exerciseMetrics.activeLeg === 'RIGHT' ? 'Right' : 'Detecting...'}
                    </span>
                  </div>
                )}
                {exerciseMetrics.exercise === 'LUNGE' && exerciseMetrics.frontKneeAngle != null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Lead Knee</span>
                    <span className="font-mono">{exerciseMetrics.frontKneeAngle}°</span>
                  </div>
                )}
                {exerciseMetrics.kneeAngle !== undefined && exerciseMetrics.kneeAngle !== null && exerciseMetrics.exercise !== 'LUNGE' && exerciseMetrics.exercise !== 'BICEP_CURL' && exerciseMetrics.exercise !== 'SHOULDER_PRESS' && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Knee Angle</span>
                    <span className="font-mono">{exerciseMetrics.kneeAngle}°</span>
                  </div>
                )}
                {exerciseMetrics.elbowAngle !== undefined && exerciseMetrics.elbowAngle !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Elbow Angle</span>
                    <span className="font-mono">{exerciseMetrics.elbowAngle}°</span>
                  </div>
                )}
                {exerciseMetrics.hipAngle !== undefined && exerciseMetrics.hipAngle !== null && exerciseMetrics.exercise !== 'BICEP_CURL' && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Body Alignment</span>
                    <span className="font-mono">{exerciseMetrics.hipAngle}°</span>
                  </div>
                )}
                {exerciseMetrics.spineAngle !== undefined && exerciseMetrics.spineAngle !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Spine Angle</span>
                    <span className="font-mono">{exerciseMetrics.spineAngle}°</span>
                  </div>
                )}
              </div>
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); resetAnalyzer(); }}
              className="bg-black/60 hover:bg-black/80 transition-colors text-white/80 text-xs py-1.5 px-3 rounded-md backdrop-blur-md border border-white/10 self-start"
            >
              Reset Exercise
            </button>
          </div>
        )}
        
        {/* Performance / Diagnostics Panel (Subtle) */}

        {state === 'RUNNING' && (
          <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs font-mono text-white/90 z-20">
            <div className="bg-black/60 px-3 py-2 rounded-lg backdrop-blur-md border border-white/10 flex gap-4">
              <div>
                <span className="opacity-60 block text-[10px]">FPS</span>
                <span className={metrics.fps >= 24 ? "text-green-400 font-bold" : "text-yellow-400 font-bold"}>
                  {metrics.fps}
                </span>
              </div>
              <div>
                <span className="opacity-60 block text-[10px]">LATENCY</span>
                <span className="font-bold">{metrics.latency}ms</span>
              </div>
            </div>
            
            <div className="bg-black/60 px-3 py-2 rounded-lg backdrop-blur-md border border-white/10">
              <span className="opacity-60 block text-[10px]">POSE QUALITY</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${metrics.confidence > 75 ? 'bg-green-500' : metrics.confidence > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${metrics.confidence}%` }}
                  />
                </div>
                <span className="font-bold w-8 text-right">{metrics.confidence}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
