import { createFileRoute } from '@tanstack/react-router'
import RadarPage from '@/pages/RadarPage'

export const Route = createFileRoute('/radar')({
  ssr: false,
  component: RadarPage,
})
