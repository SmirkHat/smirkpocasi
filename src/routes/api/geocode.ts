import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/geocode'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/geocode')({
  server: {
    handlers: apiHandlers(handler),
  },
})
