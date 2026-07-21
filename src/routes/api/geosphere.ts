import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/geosphere'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/geosphere')({
  server: {
    handlers: apiHandlers(handler),
  },
})
