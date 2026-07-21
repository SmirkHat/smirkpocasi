import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/hydro'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/hydro')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
