import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/inpocasi-stations'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/inpocasi-stations')({
  server: {
    handlers: apiHandlers(handler),
  },
})
