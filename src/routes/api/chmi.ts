import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/chmi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
