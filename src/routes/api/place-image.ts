import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/place-image'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/place-image')({
  server: {
    handlers: apiHandlers(handler),
  },
})
