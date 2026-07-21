import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/wunderground'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/wunderground')({
  server: {
    handlers: apiHandlers(handler),
  },
})
