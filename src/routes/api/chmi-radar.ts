import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/chmi-radar'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi-radar')({
  server: {
    handlers: apiHandlers(handler),
  },
})
