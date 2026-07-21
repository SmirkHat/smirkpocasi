import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/hydro'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/hydro')({
  server: {
    handlers: apiHandlers(handler),
  },
})
