import { createFileRoute, redirect } from '@tanstack/react-router'

/** Legacy /settings bookmarks → home; Lokace is a dialog now. */
export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
