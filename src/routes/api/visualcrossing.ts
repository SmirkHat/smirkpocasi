import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/visualcrossing'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/visualcrossing')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
