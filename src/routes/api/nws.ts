import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/nws'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/nws')({
  server: {
    handlers: apiHandlers(handler),
  },
})
