import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/meteostat'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteostat')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
