import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/xweather'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/xweather')({
  server: {
    handlers: apiHandlers(handler),
  },
})
