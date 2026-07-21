import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/warnings'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/warnings')({
  server: {
    handlers: apiHandlers(handler),
  },
})
