import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/accuweather'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/accuweather')({
  server: {
    handlers: apiHandlers(handler),
  },
})
