import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Square, X, CheckCircle, FileDown } from 'lucide-react';
import { ExerciseType, ExerciseMetrics, FormAssessment, RepFormAssessment } from '../types';
import { VideoPoseProcessor } from '../engine/VideoPoseProcessor';
import { ExerciseRegistry } from '../engine/ExerciseRegistry';
import { ExerciseAnalyzer } from '../engine/ExerciseAnalyzer';
import { SquatFormAnalyzer } from '../engine/SquatFormAnalyzer';
import { PdfReportGenerator, AnalysisResultData } from '../reports/PdfReportGenerator';

type UploadState = 'EMPTY' | 'READY' | 'ANALYZING' | 'COMPLETED' | 'ERROR';

export function VideoUpload() {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('SQUAT');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('EMPTY');
  
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState<ExerciseMetrics | null>(null);
  const [formAssessment, setFormAssessment] = useState<FormAssessment | null>(null);
  const [repAssessments, setRepAssessments] = useState<RepFormAssessment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const processorRef = useRef<VideoPoseProcessor | null>(null);
  const analyzerRef = useRef<ExerciseAnalyzer | null>(null);
  const formAnalyzerRef = useRef<SquatFormAnalyzer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage VideoPoseProcessor instance
  useEffect(() => {
    processorRef.current = new VideoPoseProcessor();
    return () => {
      processorRef.current?.destroy();
    };
  }, []);

  // Cleanup object URL on unmount or when preview url changes
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // Clear previous
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }
    
    setVideoFile(null);
    setError(null);
    setPdfError(null);
    setMetrics(null);
    setFormAssessment(null);
    setRepAssessments([]);
    setProgress(0);

    if (!file) {
      setUploadState('EMPTY');
      return;
    }

    // Basic validation
    if (!file.type.startsWith('video/')) {
      setError('Unsupported video format.');
      setUploadState('ERROR');
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    setVideoFile(file);
    setUploadState('READY');
  };

  const handleClear = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }
    setVideoFile(null);
    setUploadState('EMPTY');
    setError(null);
    setPdfError(null);
    setMetrics(null);
    setFormAssessment(null);
    setRepAssessments([]);
    setProgress(0);
    
    // Reset the input value so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleStartProcessing = async () => {
    if (!videoFile || !processorRef.current) return;
    
    setError(null);
    setPdfError(null);
    setUploadState('ANALYZING');
    setProgress(0);

    try {
      analyzerRef.current = ExerciseRegistry.getAnalyzer(selectedExercise);
      await analyzerRef.current.initialize();

      processorRef.current.setCallbacks(
        (frame) => {
          analyzerRef.current?.analyzePoseFrame(frame);
          const currentMetrics = analyzerRef.current?.getMetrics() || null;
          setMetrics(currentMetrics);
          
          if (analyzerRef.current?.getFormAssessment) {
            setFormAssessment(analyzerRef.current.getFormAssessment());
          }
        },
        (p) => {
          setProgress(p);
        },
        () => {
          setUploadState('COMPLETED');
          setProgress(100);
          if (analyzerRef.current?.getRepAssessments) {
            setRepAssessments(analyzerRef.current.getRepAssessments());
          }
        },
        (err) => {
          setError(err.message);
          setUploadState('ERROR');
        }
      );

      await processorRef.current.processVideo(videoFile);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploadState('ERROR');
    }
  };

  const handleCancel = () => {
    processorRef.current?.cancel();
    setUploadState('READY');
  };

  const handleDownloadPDF = async () => {
    if (uploadState !== 'COMPLETED' || !videoFile) return;
    setPdfError(null);
    
    try {
      const data: AnalysisResultData = {
        exercise: selectedExercise,
        originalFilename: videoFile.name,
        date: new Date(),
        status: 'Completed',
        metrics,
        formAssessment,
        repAssessments
      };
      
      await PdfReportGenerator.generateReport(data);
    } catch (err) {
      console.error(err);
      setPdfError("Unable to generate the PDF report. Please try again.");
    }
  };

  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Upload Video for Analysis
        </h2>
        <p className="text-sm text-muted-foreground">
          Select an exercise and upload a video to get form feedback.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Exercise Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Exercise</label>
          <select 
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value as ExerciseType)}
            className="p-2 bg-background border border-border rounded-md text-sm w-full md:w-1/2"
            disabled={uploadState === 'ANALYZING'}
          >
            {ExerciseRegistry.getAllDefinitions().map((def) => (
              <option key={def.id} value={def.id}>
                {def.name}
              </option>
            ))}
          </select>
          {!ExerciseRegistry.isImplemented(selectedExercise) && (
            <p className="text-xs text-amber-500 font-medium mt-1">
              Analysis for this exercise is coming soon.
            </p>
          )}
        </div>

        {/* File Upload / Preview Area */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Video File</label>
          
          {uploadState === 'EMPTY' || (uploadState === 'ERROR' && !videoFile) ? (
            <label className="block w-full p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors">
              <input 
                ref={fileInputRef}
                type="file" 
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="w-8 h-8" />
                <span className="font-medium">Choose File</span>
                <span className="text-xs">MP4, WebM, MOV supported</span>
              </div>
            </label>
          ) : (
            <div className="bg-secondary/30 rounded-xl border border-border overflow-hidden">
              {videoPreviewUrl && (
                <div className="relative aspect-video bg-black">
                  <video 
                    src={videoPreviewUrl} 
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                    muted
                  />
                  {uploadState !== 'ANALYZING' && (
                    <button 
                      onClick={handleClear}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                      title="Remove video"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              
              {videoFile && (
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm truncate max-w-[200px] sm:max-w-[300px]">
                      {videoFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(videoFile.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Ready for analysis</span>
                    <span className="sm:hidden">Ready</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-4 flex-wrap">
        {uploadState !== 'ANALYZING' && uploadState !== 'COMPLETED' ? (
          <button
            onClick={handleStartProcessing}
            disabled={!videoFile || uploadState === 'ERROR' || !ExerciseRegistry.isImplemented(selectedExercise)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Analyze Video
          </button>
        ) : uploadState === 'ANALYZING' ? (
          <button
            onClick={handleCancel}
            className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-destructive/90 transition-colors"
          >
            <Square className="w-4 h-4" />
            Cancel Processing
          </button>
        ) : uploadState === 'COMPLETED' ? (
          <button
            onClick={handleDownloadPDF}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-green-700 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Download PDF Report
          </button>
        ) : null}
      </div>
      
      {pdfError && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {pdfError}
        </div>
      )}

      {/* Progress & Results */}
      {(uploadState === 'ANALYZING' || uploadState === 'COMPLETED' || progress > 0) && (
        <div className="flex flex-col gap-4 mt-4 p-4 bg-secondary/50 rounded-lg">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span>{uploadState === 'ANALYZING' ? 'Processing...' : uploadState === 'COMPLETED' ? 'Completed' : 'Status'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {metrics && (() => {
            const isCompleted = uploadState === 'COMPLETED';
            const completedReps = repAssessments.length > 0 ? repAssessments.length : (metrics.reps ?? 0);
            const isDepthExercise = selectedExercise === 'SQUAT' || selectedExercise === 'PUSH_UP' || selectedExercise === 'LUNGE';

            // Valid depth measurements
            const validRepsWithDepth = repAssessments.filter(r => typeof r.depth === 'number' && !isNaN(r.depth) && isFinite(r.depth));
            const avgDepth = validRepsWithDepth.length > 0
              ? `${Math.round(validRepsWithDepth.reduce((s, r) => s + (r.depth as number), 0) / validRepsWithDepth.length)}%`
              : 'N/A';

            // Valid ROM measurements
            const validRepsWithROMPercent = repAssessments.filter(r => typeof r.romPercent === 'number' && !isNaN(r.romPercent) && isFinite(r.romPercent));
            const avgROMPercent = validRepsWithROMPercent.length > 0
              ? `${Math.round(validRepsWithROMPercent.reduce((s, r) => s + (r.romPercent as number), 0) / validRepsWithROMPercent.length)}%`
              : null;

            const validRepsWithROM = repAssessments.filter(r => typeof r.rom === 'number' && !isNaN(r.rom) && isFinite(r.rom));
            const avgAngularROM = validRepsWithROM.length > 0
              ? `${Math.round(validRepsWithROM.reduce((s, r) => s + (r.rom as number), 0) / validRepsWithROM.length)}°`
              : null;

            const avgROM = avgROMPercent ?? avgAngularROM ?? 'N/A';

            // Average Form Score
            const avgScore = repAssessments.length > 0
              ? `${Math.round(repAssessments.reduce((s, r) => s + r.formScore, 0) / repAssessments.length)}/100`
              : formAssessment?.overallScore != null ? `${Math.round(formAssessment.overallScore)}/100` : 'N/A';

            return (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  <div className="bg-background p-3 rounded border text-center">
                    <span className="block text-xs text-muted-foreground uppercase">
                      {isCompleted ? 'Status' : 'Phase'}
                    </span>
                    <span className="font-bold">{isCompleted ? 'Completed' : metrics.phase}</span>
                  </div>
                  <div className="bg-background p-3 rounded border text-center">
                    <span className="block text-xs text-muted-foreground uppercase">
                      {metrics.reps !== null ? 'Reps' : 'Hold Time'}
                    </span>
                    <span className="font-bold text-xl">
                      {metrics.reps !== null
                        ? (isCompleted ? completedReps : metrics.reps)
                        : metrics.holdDurationMs != null
                        ? `${(metrics.holdDurationMs / 1000).toFixed(1)}s`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-background p-3 rounded border text-center">
                    <span className="block text-xs text-muted-foreground uppercase">
                      {isCompleted
                        ? (isDepthExercise ? 'Avg Depth' : 'Avg ROM')
                        : (isDepthExercise ? 'Depth' : 'ROM')}
                    </span>
                    <span className="font-bold text-xl">
                      {isCompleted
                        ? (isDepthExercise ? avgDepth : avgROM)
                        : (isDepthExercise
                            ? (metrics.depth != null ? `${metrics.depth}%` : 'N/A')
                            : (metrics.romPercent != null
                                ? `${metrics.romPercent}%`
                                : metrics.rangeOfMotion != null
                                ? `${metrics.rangeOfMotion}°`
                                : 'N/A'))}
                    </span>
                  </div>
                  <div className="bg-background p-3 rounded border text-center">
                    <span className="block text-xs text-muted-foreground uppercase">
                      {isCompleted ? 'Avg Form Score' : 'Confidence'}
                    </span>
                    <span className="font-bold text-xl">
                      {isCompleted ? avgScore : `${Math.round(metrics.confidence * 100)}%`}
                    </span>
                  </div>
                </div>

                {isCompleted && completedReps === 0 && (
                  <p className="text-xs text-amber-500 text-center mt-1">
                    No completed repetitions detected. Ensure the user's full body and active joints remain visible throughout the video.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
