import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/netatmo'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/netatmo')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
