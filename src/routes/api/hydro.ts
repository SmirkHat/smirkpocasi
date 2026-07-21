import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/hydro'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/hydro')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
