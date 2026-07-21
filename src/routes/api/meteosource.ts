import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/meteosource'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteosource')({
  server: {
    handlers: apiHandlers(handler),
  },
})
