import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weather'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weather')({
  server: {
    handlers: apiHandlers(handler),
  },
})
