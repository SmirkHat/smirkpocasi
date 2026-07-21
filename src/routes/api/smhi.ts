import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/smhi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/smhi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
