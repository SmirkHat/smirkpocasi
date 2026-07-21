import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weatherapi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weatherapi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
