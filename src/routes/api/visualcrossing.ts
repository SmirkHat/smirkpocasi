import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/visualcrossing'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/visualcrossing')({
  server: {
    handlers: apiHandlers(handler),
  },
})
