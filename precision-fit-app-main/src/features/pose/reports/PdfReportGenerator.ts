import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExerciseMetrics, FormAssessment, RepFormAssessment } from '../types';
import { ExerciseRegistry } from '../engine/ExerciseRegistry';

export interface AnalysisResultData {
  exercise: string;
  originalFilename: string;
  date: Date;
  status: string;
  metrics: ExerciseMetrics | null;
  formAssessment: FormAssessment | null;
  repAssessments: RepFormAssessment[];
}

export class PdfReportGenerator {
  public static async generateReport(data: AnalysisResultData): Promise<void> {
    const doc = new jsPDF();
    
    // Page 1 Header
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("FITASSIST PRO", 14, 20);
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Workout Form Analysis Report", 14, 28);
    
    // Video Information
    const exerciseDef = ExerciseRegistry.getDefinition(data.exercise as any);
    const exerciseTitle = exerciseDef?.name || data.exercise;

    doc.setFontSize(11);
    doc.text(`Exercise: ${exerciseTitle}`, 14, 40);
    doc.text(`File: ${data.originalFilename}`, 14, 46);
    doc.text(`Date: ${data.date.toLocaleString()}`, 14, 52);
    doc.text(`Status: ${data.status}`, 14, 58);
    
    // Summary Metrics
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Analysis Summary", 14, 75);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    const isRepBased = data.metrics?.reps !== null && data.metrics?.reps !== undefined;
    const totalReps = isRepBased ? data.metrics?.reps ?? 0 : null;
    const holdDuration = data.metrics?.holdDurationMs != null
      ? `${(data.metrics.holdDurationMs / 1000).toFixed(1)}s`
      : 'N/A';
    
    const isDepthExercise = data.exercise === 'SQUAT' || data.exercise === 'PUSH_UP' || data.exercise === 'LUNGE';
    const isROMExercise = data.exercise === 'BICEP_CURL' || data.exercise === 'SHOULDER_PRESS';

    let avgDepth = 'N/A';
    let avgROMPercent: string | null = null;
    let avgROM = 'N/A';
    let avgFormScore = 'N/A';
    let avgDuration = 'N/A';
    
    const repCount = data.repAssessments.length;
    if (repCount > 0) {
      // Depth calculation (only from valid numerical depth entries)
      const validDepthReps = data.repAssessments.filter(r => typeof r.depth === 'number' && !isNaN(r.depth) && isFinite(r.depth));
      if (validDepthReps.length > 0) {
        const depthSum = validDepthReps.reduce((sum, r) => sum + (r.depth as number), 0);
        avgDepth = Math.round(depthSum / validDepthReps.length) + '%';
      }

      // Normalized ROM% calculation
      const validROMPercentReps = data.repAssessments.filter(r => typeof r.romPercent === 'number' && !isNaN(r.romPercent) && isFinite(r.romPercent));
      if (validROMPercentReps.length > 0) {
        const romPercentSum = validROMPercentReps.reduce((sum, r) => sum + (r.romPercent as number), 0);
        avgROMPercent = Math.round(romPercentSum / validROMPercentReps.length) + '%';
      }
      
      // Angular ROM in degrees
      const validROMReps = data.repAssessments.filter(r => typeof r.rom === 'number' && !isNaN(r.rom) && isFinite(r.rom));
      if (validROMReps.length > 0) {
        const romSum = validROMReps.reduce((sum, r) => sum + (r.rom as number), 0);
        avgROM = Math.round(romSum / validROMReps.length) + '°';
      }

      const scoreSum = data.repAssessments.reduce((sum, r) => sum + r.formScore, 0);
      avgFormScore = Math.round(scoreSum / repCount) + '/100';
      
      const durationSum = data.repAssessments.reduce((sum, r) => sum + (r.eccentricDurationMs + r.concentricDurationMs), 0);
      avgDuration = Math.round(durationSum / repCount) + 'ms';
    }
    
    const summaryRows: (string | number)[][] = [
      isRepBased ? ['Total Reps', totalReps ?? 0] : ['Hold Duration', holdDuration],
    ];

    if (isDepthExercise) {
      summaryRows.push(['Average Depth', avgDepth]);
      summaryRows.push(['Average ROM', avgROM]);
    } else if (isROMExercise) {
      summaryRows.push(['Average Range of Motion', avgROMPercent ?? avgROM]);
      summaryRows.push(['Average Angular ROM', avgROM]);
    } else {
      summaryRows.push(['Average Depth', avgDepth]);
      summaryRows.push(['Average ROM', avgROM]);
    }

    summaryRows.push(
      ['Average Form Score', avgFormScore],
      ['Average Rep Duration', avgDuration],
      ['Final Confidence', data.metrics ? Math.round(data.metrics.confidence * 100) + '%' : 'N/A'],
      ['Final Phase', data.metrics?.phase ?? 'N/A'],
    );

    autoTable(doc, {
      startY: 80,
      head: [['Metric', 'Value']],
      body: summaryRows,
      theme: 'striped',
    });
    
    let currentY = (doc as any).lastAutoTable.finalY + 15;
    
    // Form Issues summary
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Form Feedback", 14, currentY);
    currentY += 8;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    // Aggregate form issues from all reps
    const issueMap = new Map<string, number>();
    for (const rep of data.repAssessments) {
      for (const issue of rep.issues) {
        issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
      }
    }
    
    if (issueMap.size === 0) {
      doc.text("No significant form issues detected by the current analysis.", 14, currentY);
      currentY += 10;
    } else {
      const issueBody = Array.from(issueMap.entries()).map(([issue, count]) => [
        issue.replace(/_/g, ' '),
        `${count} occurrence${count !== 1 ? 's' : ''}`
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Issue', 'Occurrences']],
        body: issueBody,
        theme: 'plain',
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ANALYSIS STATUS", 14, currentY);
    currentY += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Completed: 100%`, 14, currentY);
    if (data.formAssessment) {
      doc.text(`Final Overall Form Score: ${Math.round(data.formAssessment.overallScore)}/100`, 14, currentY + 6);
    }
    if (exerciseDef?.cameraViewDescription) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(110);
      doc.text(`Tracking Note: ${exerciseDef.cameraViewDescription}`, 14, currentY + 13, { maxWidth: 180 });
      doc.setTextColor(0);
      doc.setFont("helvetica", "normal");
    }
    
    // Rep-by-rep Analysis Table
    if (data.repAssessments.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Rep-by-Rep Analysis", 14, 20);
      
      const repBody = data.repAssessments.map(rep => {
        const depthOrRomPercent = isROMExercise
          ? (rep.romPercent != null ? rep.romPercent + '%' : 'N/A')
          : (rep.depth != null ? rep.depth + '%' : 'N/A');
        const angularRom = rep.rom != null ? rep.rom + '°' : 'N/A';
        const duration = (rep.eccentricDurationMs + rep.concentricDurationMs) + 'ms';
        const issuesStr = rep.issues.length > 0 ? rep.issues.join(', ').replace(/_/g, ' ') : 'None';

        return [
          rep.repNumber,
          depthOrRomPercent,
          angularRom,
          duration,
          rep.formScore,
          issuesStr
        ];
      });
      
      autoTable(doc, {
        startY: 28,
        head: [[
          'Rep',
          isROMExercise ? 'ROM %' : 'Depth',
          isROMExercise ? 'Angular ROM' : 'ROM',
          'Duration',
          'Form Score',
          'Issues'
        ]],
        body: repBody,
        theme: 'striped',
      });
    }
    
    // Footer / Privacy
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(
        "Privacy Note: Video analysis was performed locally on the user's device. The original video was not uploaded to or stored on the backend.",
        14,
        doc.internal.pageSize.height - 10,
        { maxWidth: 180 }
      );
    }
    
    const safeDate = data.date.toISOString().split('T')[0];
    const safeExercise = data.exercise.replace(/[^a-z0-9]/gi, '_');
    doc.save(`FitAssist_Pro_${safeExercise}_Analysis_${safeDate}.pdf`);
  }
}
