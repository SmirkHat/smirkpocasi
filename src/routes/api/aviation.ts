import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/aviation'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/aviation')({
  server: {
    handlers: apiHandlers(handler),
  },
})
