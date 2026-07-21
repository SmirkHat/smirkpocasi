import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/imgw'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/imgw')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
