import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/chmi'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi')({
  server: {
    handlers: apiHandlers(handler),
  },
})
