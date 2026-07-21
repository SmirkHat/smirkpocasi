import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/meteostat'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteostat')({
  server: {
    handlers: apiHandlers(handler),
  },
})
