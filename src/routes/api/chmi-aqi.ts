import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/chmi-aqi'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi-aqi')({
  server: {
    handlers: apiHandlers(handler),
  },
})
