import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/accuweather'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/accuweather')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
