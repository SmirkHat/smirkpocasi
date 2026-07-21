import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weatherbit'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weatherbit')({
  server: {
    handlers: apiHandlers(handler),
  },
})
