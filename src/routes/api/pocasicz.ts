import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/pocasicz'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/pocasicz')({
  server: {
    handlers: apiHandlers(handler),
  },
})
