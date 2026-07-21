import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/wunderground'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/wunderground')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
