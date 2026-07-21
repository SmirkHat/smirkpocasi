import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/shmu'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/shmu')({
  server: {
    handlers: apiHandlers(handler),
  },
})
