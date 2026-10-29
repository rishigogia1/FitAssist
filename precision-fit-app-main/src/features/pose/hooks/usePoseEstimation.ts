import { useState, useEffect, useRef, useCallback } from 'react';
import { PoseEngine } from '../engine/PoseEngine';
import { PoseEngineState, PoseFrame, ExerciseMetrics, FormAssessment, ExerciseType } from '../types';
import { ExerciseRegistry } from '../engine/ExerciseRegistry';
import { ExerciseAnalyzer } from '../engine/ExerciseAnalyzer';
import { TemporalSequenceBuffer } from '../engine/TemporalSequenceBuffer';
import { MissingModelClassifier, TemporalFormClassifier } from '../engine/TemporalFormClassifier';

export function usePoseEstimation(initialExercise: ExerciseType = 'SQUAT') {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>(initialExercise);
  const [state, setState] = useState<PoseEngineState>('IDLE');
  const [error, setError] = useState<Error | null>(null);
  
  // UI metrics (updated at throttled intervals for React)
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [confidence, setConfidence] = useState(0);
  
  const [exerciseMetrics, setExerciseMetrics] = useState<ExerciseMetrics | null>(null);
  const [formAssessment, setFormAssessment] = useState<FormAssessment | null>(null);

  // High-frequency refs to prevent excessive React re-renders
  const frameRef = useRef<PoseFrame | null>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const analyzerRef = useRef<ExerciseAnalyzer | null>(null);
  const sequenceBufferRef = useRef<TemporalSequenceBuffer | null>(null);
  const mlClassifierRef = useRef<TemporalFormClassifier | null>(null);
  
  // Prevent parallel overlapping ML inferences
  const isInferencingRef = useRef<boolean>(false);

  // Initialize engine and active analyzer
  useEffect(() => {
    const engine = new PoseEngine();
    const analyzer = ExerciseRegistry.getAnalyzer(selectedExercise);
    const sequenceBuffer = new TemporalSequenceBuffer();
    const mlClassifier = new MissingModelClassifier();
    
    engineRef.current = engine;
    analyzerRef.current = analyzer;
    sequenceBufferRef.current = sequenceBuffer;
    mlClassifierRef.current = mlClassifier;

    analyzer.initialize().catch(err => {
      console.warn("Failed to initialize analyzer:", err);
    });

    mlClassifier.initialize().catch(err => {
      console.warn("Failed to initialize ML classifier:", err);
    });

    engine.setCallbacks(
      (newState) => {
        setState(newState);
      },
      (frame, currentFps) => {
        frameRef.current = frame;
        
        // Pass frame to the active exercise analyzer
        analyzerRef.current?.analyzePoseFrame(frame);
        
        const currentMetrics = analyzerRef.current?.getMetrics();
        const currentAssessment = analyzerRef.current?.getFormAssessment?.();
        
        // Push to temporal buffer for sequence ML classification if applicable
        sequenceBufferRef.current?.push(frame);
        
        if (
          sequenceBufferRef.current?.isReady() && 
          !isInferencingRef.current && 
          mlClassifierRef.current &&
          selectedExercise === 'SQUAT'
        ) {
          isInferencingRef.current = true;
          const sequence = sequenceBufferRef.current.getSequence();
          
          mlClassifierRef.current.predict(sequence).then(prediction => {
            if (analyzerRef.current && (analyzerRef.current as any).injectMLPrediction) {
              (analyzerRef.current as any).injectMLPrediction(prediction);
            }
          }).catch(err => {
            console.warn("ML inference error:", err);
          }).finally(() => {
            isInferencingRef.current = false;
          });
        }
        
        // Update React UI state at controlled intervals
        if (frame.timestamp % 15 === 0 || currentFps !== fps) {
          setFps(currentFps);
          setLatency(Math.round(frame.inferenceLatencyMs));
          setConfidence(Math.round(frame.confidence * 100));
          
          if (currentMetrics) setExerciseMetrics(currentMetrics);
          if (currentAssessment) setFormAssessment(currentAssessment);
        }
      },
      (err) => {
        setError(err);
      }
    );

    return () => {
      engine.destroy();
      analyzerRef.current?.destroy?.();
      mlClassifier.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switches the active exercise analyzer cleanly without retaining stale state.
   */
  const setExercise = useCallback((exercise: ExerciseType) => {
    setSelectedExercise(exercise);
    analyzerRef.current?.destroy?.();
    
    const newAnalyzer = ExerciseRegistry.getAnalyzer(exercise);
    analyzerRef.current = newAnalyzer;
    newAnalyzer.reset();
    
    sequenceBufferRef.current?.reset();
    isInferencingRef.current = false;
    
    setExerciseMetrics(newAnalyzer.getMetrics());
    setFormAssessment(newAnalyzer.getFormAssessment?.() || null);
  }, []);

  const start = useCallback(async (videoElement: HTMLVideoElement) => {
    setError(null);
    analyzerRef.current?.reset();
    sequenceBufferRef.current?.reset();
    isInferencingRef.current = false;
    
    setExerciseMetrics(analyzerRef.current?.getMetrics() || null);
    setFormAssessment(analyzerRef.current?.getFormAssessment?.() || null);
    
    await engineRef.current?.start(videoElement);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setFps(0);
    setLatency(0);
    setConfidence(0);
  }, []);

  const resetAnalyzer = useCallback(() => {
    analyzerRef.current?.reset();
    sequenceBufferRef.current?.reset();
    setExerciseMetrics(analyzerRef.current?.getMetrics() || null);
    setFormAssessment(analyzerRef.current?.getFormAssessment?.() || null);
  }, []);

  return {
    state,
    error,
    start,
    stop,
    resetAnalyzer,
    frameRef,
    metrics: {
      fps,
      latency,
      confidence
    },
    exerciseMetrics,
    formAssessment,
    selectedExercise,
    setExercise,
    isImplemented: ExerciseRegistry.isImplemented(selectedExercise)
  };
}
