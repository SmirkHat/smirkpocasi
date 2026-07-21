import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/pocasicz'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/pocasicz')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
