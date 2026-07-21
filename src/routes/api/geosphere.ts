import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/geosphere'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/geosphere')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
