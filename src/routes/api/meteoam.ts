import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/meteoam'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteoam')({
  server: {
    handlers: apiHandlers(handler),
  },
})
