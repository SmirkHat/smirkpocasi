import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/warnings'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/warnings')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
