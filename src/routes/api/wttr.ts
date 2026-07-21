import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/wttr'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/wttr')({
  server: {
    handlers: apiHandlers(handler),
  },
})
