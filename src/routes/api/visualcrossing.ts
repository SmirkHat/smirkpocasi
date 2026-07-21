import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/visualcrossing'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/visualcrossing')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
