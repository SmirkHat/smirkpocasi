import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/rainviewer'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/rainviewer')({
  server: {
    handlers: apiHandlers(handler),
  },
})
