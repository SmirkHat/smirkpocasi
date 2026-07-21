import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/aviation'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/aviation')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
