import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/pocasicz'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/pocasicz')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
