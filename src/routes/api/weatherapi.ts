import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weatherapi'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weatherapi')({
  server: {
    handlers: apiHandlers(handler),
  },
})
