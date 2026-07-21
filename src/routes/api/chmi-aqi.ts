import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/chmi-aqi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi-aqi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
