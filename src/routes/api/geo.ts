import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/geo'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/geo')({
  server: {
    handlers: apiHandlers(handler),
  },
})
