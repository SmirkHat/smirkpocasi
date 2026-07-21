import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/home'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/home')({
  server: {
    handlers: apiHandlers(handler),
  },
})
