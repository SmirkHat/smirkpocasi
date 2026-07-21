import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/wttr'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/wttr')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
