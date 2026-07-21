import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../api/openweathermap'
import { adaptVercelHandler } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/openweathermap')({
  server: {
    handlers: {
      GET: adaptVercelHandler(handler),
    },
  },
})
