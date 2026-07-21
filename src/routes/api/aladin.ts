import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/aladin'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/aladin')({
  server: {
    handlers: apiHandlers(handler),
  },
})
