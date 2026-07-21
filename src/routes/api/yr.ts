import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/yr'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/yr')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
