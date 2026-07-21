import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/meteoam'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteoam')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
