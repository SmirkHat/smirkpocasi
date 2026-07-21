import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/meteosource'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/meteosource')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
