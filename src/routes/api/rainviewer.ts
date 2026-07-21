import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/rainviewer'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/rainviewer')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
