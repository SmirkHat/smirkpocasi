import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/bmkg'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/bmkg')({
  server: {
    handlers: apiHandlers(handler),
  },
})
