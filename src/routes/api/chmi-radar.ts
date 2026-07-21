import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/chmi-radar'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi-radar')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
