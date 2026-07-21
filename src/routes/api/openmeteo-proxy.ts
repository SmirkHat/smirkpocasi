import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/openmeteo-proxy'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/openmeteo-proxy')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
