import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/marine'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/marine')({
  server: {
    handlers: apiHandlers(handler),
  },
})
