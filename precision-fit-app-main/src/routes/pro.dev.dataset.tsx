import { createFileRoute, redirect } from '@tanstack/react-router'
import { DevDatasetCollector } from '../pages/DevDatasetCollector'

export const Route = createFileRoute('/pro/dev/dataset')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: DevDatasetCollector,
})
