import { create } from "zustand"

export type CampaignPhase = "all" | "planned" | "active" | "finished"

type FilterState = {
  date: string
  cities: string[]
  format: "ГМ" | "СМ" | null
  status: "Платник" | "Не платник" | null
  campaignPhase: CampaignPhase
  searchCampaign: string
  searchClient: string

  setDate: (date: string) => void
  setCities: (cities: string[]) => void
  setFormat: (format: "ГМ" | "СМ" | null) => void
  setStatus: (status: "Платник" | "Не платник" | null) => void
  setCampaignPhase: (phase: CampaignPhase) => void
  setSearchCampaign: (search: string) => void
  setSearchClient: (search: string) => void
  reset: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  date: new Date().toISOString().split('T')[0],
  cities: [],
  format: null,
  status: null,
  campaignPhase: "active",
  searchCampaign: "",
  searchClient: "",

  setDate: (date) => set({ date }),
  setCities: (cities) => set({ cities }),
  setFormat: (format) => set({ format }),
  setStatus: (status) => set({ status }),
  setCampaignPhase: (campaignPhase) => set({ campaignPhase }),
  setSearchCampaign: (searchCampaign) => set({ searchCampaign }),
  setSearchClient: (searchClient) => set({ searchClient }),
  reset: () => set({
    date: new Date().toISOString().split('T')[0],
    cities: [],
    format: null,
    status: null,
    campaignPhase: "active",
    searchCampaign: "",
    searchClient: "",
  })
}))
