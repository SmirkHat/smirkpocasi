import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/tomorrowio'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/tomorrowio')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
