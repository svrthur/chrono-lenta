import { create } from "zustand"

type FilterState = {
  date: string
  cities: string[]
  format: "ГМ" | "СМ" | null
  status: "Платник" | "Не платник" | null
  showActiveOnly: boolean
  loadFilter: "all" | "overloaded" | "free"
  searchCampaign: string
  searchClient: string
  
  setDate: (date: string) => void
  setCities: (cities: string[]) => void
  setFormat: (format: "ГМ" | "СМ" | null) => void
  setStatus: (status: "Платник" | "Не платник" | null) => void
  setShowActiveOnly: (show: boolean) => void
  setLoadFilter: (filter: "all" | "overloaded" | "free") => void
  setSearchCampaign: (search: string) => void
  setSearchClient: (search: string) => void
  reset: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  date: new Date().toISOString().split('T')[0],
  cities: [],
  format: null,
  status: null,
  showActiveOnly: true,
  loadFilter: "all",
  searchCampaign: "",
  searchClient: "",

  setDate: (date) => set({ date }),
  setCities: (cities) => set({ cities }),
  setFormat: (format) => set({ format }),
  setStatus: (status) => set({ status }),
  setShowActiveOnly: (showActiveOnly) => set({ showActiveOnly }),
  setLoadFilter: (loadFilter) => set({ loadFilter }),
  setSearchCampaign: (searchCampaign) => set({ searchCampaign }),
  setSearchClient: (searchClient) => set({ searchClient }),
  reset: () => set({
    date: new Date().toISOString().split('T')[0],
    cities: [],
    format: null,
    status: null,
    showActiveOnly: true,
    loadFilter: "all",
    searchCampaign: "",
    searchClient: "",
  })
}))
