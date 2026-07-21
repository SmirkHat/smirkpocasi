import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/imgw'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/imgw')({
  server: {
    handlers: apiHandlers(handler),
  },
})
