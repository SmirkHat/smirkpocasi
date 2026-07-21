import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/netatmo'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/netatmo')({
  server: {
    handlers: apiHandlers(handler),
  },
})
