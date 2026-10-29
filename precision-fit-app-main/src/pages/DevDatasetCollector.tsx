import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePoseEstimation } from '../features/pose/hooks/usePoseEstimation';
import { FormIssueType } from '../features/pose/types';
import { TEMPORAL_WINDOW_CONFIG, TemporalSequenceBuffer, PoseFeatureVector } from '../features/pose/engine/TemporalSequenceBuffer';
import { PoseCanvas } from '../features/pose/components/PoseCanvas';
import { DatasetValidator, ValidationReport } from '../features/pose/engine/DatasetValidator';

const AVAILABLE_LABELS: (FormIssueType | 'GOOD_FORM' | 'UNKNOWN')[] = [
  'GOOD_FORM',
  'INSUFFICIENT_DEPTH',
  'EXCESSIVE_FORWARD_LEAN',
  'KNEE_VALGUS',
  'ASYMMETRIC_MOVEMENT',
  'UNKNOWN'
];

const LABEL_DESCRIPTIONS: Record<string, string> = {
  'GOOD_FORM': 'Perform controlled squats using the intended technique.',
  'INSUFFICIENT_DEPTH': 'Perform squats that consistently stop above the target depth.',
  'EXCESSIVE_FORWARD_LEAN': 'Perform squats with noticeably excessive forward torso lean.',
  'KNEE_VALGUS': 'Perform squats where the knees visibly move inward relative to the intended tracking path.',
  'ASYMMETRIC_MOVEMENT': 'Perform squats with a noticeable left/right movement imbalance.',
  'UNKNOWN': 'General or undefined movement.'
};

export function DevDatasetCollector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { start, stop, frameRef, exerciseMetrics, state, error } = usePoseEstimation();
  
  const [selectedLabel, setSelectedLabel] = useState<typeof AVAILABLE_LABELS[0]>('GOOD_FORM');
  const [participantId, setParticipantId] = useState('P001');
  const [sessionId, setSessionId] = useState('S001');
  const [isRecording, setIsRecording] = useState(false);
  
  const collectorBufferRef = useRef<TemporalSequenceBuffer>(new TemporalSequenceBuffer());
  const animationFrameRef = useRef<number>(0);
  
  const [collectedSequences, setCollectedSequences] = useState<any[]>([]);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const loop = useCallback(() => {
    if (isRecording && frameRef.current) {
      if (frameRef.current.confidence > 0.75) {
        collectorBufferRef.current.push(frameRef.current);
        
        if (collectorBufferRef.current.isReady()) {
          const sequence = collectorBufferRef.current.getSequence();
          captureSequence(sequence);
          collectorBufferRef.current.reset(); 
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [isRecording, frameRef, selectedLabel, exerciseMetrics, participantId, sessionId]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [loop]);

  const captureSequence = (features: PoseFeatureVector[]) => {
    const sample = {
      sampleId: crypto.randomUUID(),
      participantId,
      sessionId,
      exercise: exerciseMetrics?.exercise || 'SQUAT',
      label: selectedLabel,
      featureVersion: TEMPORAL_WINDOW_CONFIG.featureVersion,
      windowSize: TEMPORAL_WINDOW_CONFIG.windowSize,
      stride: TEMPORAL_WINDOW_CONFIG.stride,
      features: features,
      timestamp: Date.now(),
      source: 'web-collector'
    };
    
    setCollectedSequences(prev => [...prev, sample]);
    setValidationReport(null); // invalidate previous report
  };

  const handleValidate = () => {
    const report = DatasetValidator.validate(collectedSequences);
    setValidationReport(report);
  };

  const handleDownload = () => {
    if (collectedSequences.length === 0) return;
    const jsonl = collectedSequences.map(s => JSON.stringify(s)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/jsonlines' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `dataset_${participantId}_${sessionId}_${Date.now()}.jsonl`;
    a.click();
    
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (collectedSequences.length === 0) return;
    const header = "sampleId,participantId,sessionId,exercise,label,featureVersion,windowSize,stride,timestamp\n";
    const rows = collectedSequences.map(s => 
      `${s.sampleId},${s.participantId},${s.sessionId},${s.exercise},${s.label},${s.featureVersion},${s.windowSize},${s.stride},${s.timestamp}`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dataset_summary_${participantId}_${sessionId}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">FitAssist Pro - Developer Dataset Collector</h1>
        <p className="text-muted-foreground text-sm">Strictly captures numeric pose-features-v1 sequences for ML training.</p>
      </div>
      
      {error && <div className="p-4 bg-red-500/20 text-red-500 rounded">{error.message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          <div className="relative bg-black rounded-lg overflow-hidden border border-white/10 aspect-video">
            <video 
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
              playsInline
              muted
              autoPlay
            />
            <div className="absolute inset-0 z-0" style={{ transform: 'scaleX(-1)' }}>
              <PoseCanvas 
                width={640} 
                height={480} 
                frameRef={frameRef}
                isRunning={state === 'RUNNING'}
              />
            </div>
            
            {state === 'REQUESTING_PERMISSION' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 bg-black/50 z-10">
                <div className="animate-pulse">Requesting camera...</div>
              </div>
            )}
            {state === 'INITIALIZING' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 bg-black/50 z-10">
                <div className="animate-pulse">Loading Pose Model...</div>
              </div>
            )}
          </div>
          
          <div className="mt-2 text-xs font-mono flex flex-wrap gap-4 bg-secondary p-3 rounded-lg border">
            <span>Camera: <span className="font-bold">{videoRef.current ? 'READY' : 'WAITING'}</span></span>
            <span>Pose: <span className="font-bold">{state}</span></span>
            <span>Conf: <span className="font-bold">{(frameRef.current?.confidence ?? 0).toFixed(2)}</span></span>
            <span>Landmarks: <span className="font-bold">{frameRef.current?.landmarks?.length ? 33 : 0}</span></span>
            <span>Buffer: <span className="font-bold">{collectorBufferRef.current.getSequence().length} / 30</span></span>
            <span>Samples: <span className="font-bold">{collectedSequences.length}</span></span>
          </div>

          <div className="p-4 border rounded-lg bg-card space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-semibold block mb-1">Participant ID</label>
                <input 
                  type="text" 
                  value={participantId}
                  onChange={(e) => setParticipantId(e.target.value)}
                  disabled={isRecording}
                  placeholder="P001"
                  className="w-full p-2 rounded bg-background border"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-semibold block mb-1">Session ID</label>
                <input 
                  type="text" 
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  disabled={isRecording}
                  placeholder="S001"
                  className="w-full p-2 rounded bg-background border"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold block mb-1">Select Target Label</label>
              <select 
                value={selectedLabel}
                onChange={(e) => setSelectedLabel(e.target.value as any)}
                disabled={isRecording}
                className="w-full p-2 rounded bg-background border"
              >
                {AVAILABLE_LABELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-2 bg-background p-2 rounded border">
                <strong>Instruction:</strong> {LABEL_DESCRIPTIONS[selectedLabel] || 'Follow standard protocol.'}
              </p>
            </div>

            <button 
              onClick={() => {
                if (isRecording) {
                  setIsRecording(false);
                  collectorBufferRef.current.reset();
                  stop();
                } else {
                  if (!participantId.trim() || !sessionId.trim()) {
                    alert("Participant ID and Session ID are required!");
                    return;
                  }
                  setIsRecording(true);
                  if (videoRef.current) {
                    start(videoRef.current);
                  }
                }
              }}
              className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
                isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:opacity-90'
              }`}
            >
              {isRecording ? 'STOP RECORDING' : 'START RECORDING'}
            </button>
            
            {isRecording && <div className="text-red-500 text-xs font-bold animate-pulse text-center">🔴 RECORDING ACTIVE</div>}
          </div>
        </div>

        {/* Dashboard Side */}
        <div className="flex flex-col gap-6">
          <div className="p-4 border rounded-lg bg-card shadow-sm">
            <h2 className="text-xl font-bold mb-4">Dataset Summary</h2>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div className="bg-background p-3 rounded border">
                <span className="text-muted-foreground block mb-1">Total Samples</span>
                <span className="text-2xl font-bold">{collectedSequences.length}</span>
              </div>
              <div className="bg-background p-3 rounded border">
                <span className="text-muted-foreground block mb-1">Unique Participants</span>
                <span className="text-2xl font-bold">{new Set(collectedSequences.map(s => s.participantId)).size}</span>
              </div>
              <div className="bg-background p-3 rounded border">
                <span className="text-muted-foreground block mb-1">Unique Sessions</span>
                <span className="text-2xl font-bold">{new Set(collectedSequences.map(s => s.sessionId)).size}</span>
              </div>
              <div className="bg-background p-3 rounded border text-xs flex flex-col justify-center">
                <span>Window Size: <strong>{TEMPORAL_WINDOW_CONFIG.windowSize}</strong></span>
                <span>Features/Frame: <strong>32</strong></span>
                <span>Version: <strong>{TEMPORAL_WINDOW_CONFIG.featureVersion}</strong></span>
                <span>Stride: <strong>{TEMPORAL_WINDOW_CONFIG.stride}</strong></span>
              </div>
            </div>

            <h3 className="font-semibold text-sm mb-3">Label Distribution</h3>
            <div className="space-y-2 mb-6 text-sm">
              {AVAILABLE_LABELS.map(label => {
                const count = collectedSequences.filter(s => s.label === label).length;
                const max = Math.max(1, collectedSequences.length);
                const width = `${(count / max) * 100}%`;
                
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-1/3 truncate text-xs">{label}</span>
                    <div className="flex-1 bg-secondary h-4 rounded overflow-hidden">
                      <div className="bg-primary h-full" style={{ width }} />
                    </div>
                    <span className="w-8 text-right font-mono text-xs">{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-4">
               <button 
                 onClick={handleValidate}
                 disabled={collectedSequences.length === 0 || isRecording}
                 className="w-full py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded font-medium disabled:opacity-50 transition-colors"
               >
                 Validate Dataset
               </button>

               {validationReport && (
                 <div className="mt-4 p-4 rounded-lg text-sm border bg-background">
                   <div className="flex items-center justify-between mb-3">
                     <span className="font-bold">Status:</span>
                     {validationReport.isValid && validationReport.warnings.length === 0 ? (
                       <span className="text-green-500 font-bold px-2 py-1 bg-green-500/10 rounded">READY FOR TRAINING</span>
                     ) : validationReport.isValid ? (
                       <span className="text-yellow-500 font-bold px-2 py-1 bg-yellow-500/10 rounded">VALID (WITH WARNINGS)</span>
                     ) : (
                       <span className="text-red-500 font-bold px-2 py-1 bg-red-500/10 rounded">DATASET NOT READY</span>
                     )}
                   </div>
                   
                   <div className="flex gap-4 mb-3 font-mono text-xs">
                     <span className="text-green-500">✓ {validationReport.validCount} Valid</span>
                     <span className="text-red-500">✗ {validationReport.invalidCount} Invalid</span>
                   </div>

                   {validationReport.warnings.length > 0 && (
                     <div className="mb-2">
                       <strong className="text-yellow-500">Warnings:</strong>
                       <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                         {validationReport.warnings.map((w, i) => <li key={i} className="text-yellow-500/90">{w}</li>)}
                       </ul>
                     </div>
                   )}

                   {validationReport.errors.length > 0 && (
                     <div className="mt-2">
                       <strong className="text-red-500">Errors:</strong>
                       <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                         {validationReport.errors.slice(0, 5).map((e, i) => <li key={i} className="text-red-500/90">{e}</li>)}
                         {validationReport.errors.length > 5 && <li>...and {validationReport.errors.length - 5} more</li>}
                       </ul>
                     </div>
                   )}
                 </div>
               )}
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handleDownloadCsv}
              disabled={collectedSequences.length === 0 || isRecording}
              className="flex-1 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded font-medium disabled:opacity-50 transition-colors"
            >
              Download CSV Summary
            </button>
            <button 
              onClick={handleDownload}
              disabled={collectedSequences.length === 0 || isRecording}
              className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded font-medium disabled:opacity-50 transition-colors"
            >
              Download JSONL Dataset
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
