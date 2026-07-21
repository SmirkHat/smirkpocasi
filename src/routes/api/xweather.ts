import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/xweather'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/xweather')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
