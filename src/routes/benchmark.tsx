import { createFileRoute } from '@tanstack/react-router'
import BenchmarkPage from '@/pages/BenchmarkPage'

export const Route = createFileRoute('/benchmark')({
  component: BenchmarkPage,
})
