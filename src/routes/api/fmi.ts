import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/fmi'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/fmi')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
