import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/smhi'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/smhi')({
  server: {
    handlers: apiHandlers(handler),
  },
})
