import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/bmkg'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/bmkg')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
