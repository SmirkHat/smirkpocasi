import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/pirateweather'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/pirateweather')({
  server: {
    handlers: apiHandlers(handler),
  },
})
