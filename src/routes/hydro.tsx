import { createFileRoute } from '@tanstack/react-router'
import HydroPage from '@/pages/HydroPage'

export const Route = createFileRoute('/hydro')({
  component: HydroPage,
})
