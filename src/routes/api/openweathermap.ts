import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/openweathermap'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/openweathermap')({
  server: {
    handlers: apiHandlers(handler),
  },
})
