import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/weather'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weather')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
