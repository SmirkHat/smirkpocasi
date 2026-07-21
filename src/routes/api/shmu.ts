import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/shmu'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/shmu')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
