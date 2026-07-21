import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/nws'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/nws')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
