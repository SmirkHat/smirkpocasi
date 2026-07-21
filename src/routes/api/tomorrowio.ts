import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/tomorrowio'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/tomorrowio')({
  server: {
    handlers: apiHandlers(handler),
  },
})
