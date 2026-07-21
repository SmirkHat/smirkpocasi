import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/geocode'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/geocode')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
