import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/weathercom'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/weathercom')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
