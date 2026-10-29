import { createFileRoute } from '@tanstack/react-router'
import { AppLayout } from '@/components/AppLayout'
import { PoseCamera } from '@/features/pose/components/PoseCamera'
import { VideoUpload } from '@/features/pose/components/VideoUpload'

export const Route = createFileRoute('/pro/')({
  component: ProPage,
})

function ProPage() {
  return (
    <AppLayout title="FitAssist Pro: Form Check" subtitle="Real-time, on-device pose estimation">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">FitAssist Pro: Form Check</h1>
          <p className="text-muted-foreground max-w-3xl">
            Real-time, on-device pose estimation. Perfect your form with AI-powered movement tracking.
            Video remains on your device and is never uploaded.
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden p-6">
          <PoseCamera />
        </div>

        {/* Video Upload Section */}
        <div className="mt-12">
          <VideoUpload />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card p-5 rounded-xl border border-border">
            <h3 className="font-semibold mb-2">Privacy First</h3>
            <p className="text-sm text-muted-foreground">
              All pose inference happens locally in your browser. Raw camera feeds are never sent to the cloud.
            </p>
          </div>
          <div className="bg-card p-5 rounded-xl border border-border">
            <h3 className="font-semibold mb-2">33 Body Landmarks</h3>
            <p className="text-sm text-muted-foreground">
              Advanced tracking maps your entire body geometry in 3D space to analyze movement mechanics.
            </p>
          </div>
          <div className="bg-card p-5 rounded-xl border border-border">
            <h3 className="font-semibold mb-2">Real-time Feedback</h3>
            <p className="text-sm text-muted-foreground">
              Operating at ~30 FPS, the system can instantly capture the subtle nuances of your exercise form.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
