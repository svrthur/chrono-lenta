import React, { useState } from "react"
import { FilterBar } from "@/components/FilterBar"
import { KpiRow } from "@/components/KpiRow"
import { StatisticsBlock } from "@/components/StatisticsBlock"
import { CityGrid } from "@/components/CityGrid"
import { CampaignDetailSheet } from "@/components/CampaignDetailSheet"
import { BulkDeleteBar } from "@/components/BulkDeleteBar"
import { useServerEvents } from "@/hooks/use-server-events"

export function Home() {
  useServerEvents()

  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<number>>(new Set())
  const [detailId, setDetailId] = useState<number | null>(null)

  const handleSelectCampaigns = (ids: number[]) => {
    setSelectedCampaigns(new Set(ids))
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <FilterBar />
      <KpiRow />
      <StatisticsBlock />
      
      <main className="flex-1">
        <CityGrid 
          selectedCampaigns={selectedCampaigns}
          onSelectCampaigns={handleSelectCampaigns}
          onCampaignClick={setDetailId}
        />
      </main>

      <CampaignDetailSheet 
        campaignId={detailId} 
        onClose={() => setDetailId(null)} 
      />

      <BulkDeleteBar 
        selectedIds={Array.from(selectedCampaigns)} 
        onClear={() => setSelectedCampaigns(new Set())} 
      />
    </div>
  )
}
