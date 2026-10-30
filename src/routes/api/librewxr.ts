import { createFileRoute } from '@tanstack/react-router'
import handler from '../../../handlers/librewxr'
import { apiHandlers } from '@/server/adaptVercelHandler'

export const Route = createFileRoute('/api/librewxr')({
  server: {
    handlers: apiHandlers(handler),
  },
})
