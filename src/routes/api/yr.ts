import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/yr'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/yr')({
  server: {
    handlers: apiHandlers(handler),
  },
})
