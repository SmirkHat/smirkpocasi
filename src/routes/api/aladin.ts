import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/aladin'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/aladin')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
