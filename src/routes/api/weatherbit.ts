import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weatherbit'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weatherbit')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
