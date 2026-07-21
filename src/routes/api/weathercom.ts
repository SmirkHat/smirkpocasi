import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weathercom'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weathercom')({
  server: {
    handlers: apiHandlers(handler),
  },
})
