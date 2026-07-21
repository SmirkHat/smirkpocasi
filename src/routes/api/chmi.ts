import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/chmi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/chmi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
