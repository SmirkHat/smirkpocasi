import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/openmeteo-proxy'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/openmeteo-proxy')({
  server: {
    handlers: apiHandlers(handler),
  },
})
