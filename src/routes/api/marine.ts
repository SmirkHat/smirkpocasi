import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/marine'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/marine')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
