import { create } from 'zustand'

type UiStore = {
  locationPickerOpen: boolean
  openLocationPicker: () => void
  setLocationPickerOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  locationPickerOpen: false,
  openLocationPicker: () => set({ locationPickerOpen: true }),
  setLocationPickerOpen: (open) => set({ locationPickerOpen: open }),
}))
