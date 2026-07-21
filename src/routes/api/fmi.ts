import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/fmi'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/fmi')({
  server: {
    handlers: apiHandlers(handler),
  },
})
