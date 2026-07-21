import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/pirateweather'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/pirateweather')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
