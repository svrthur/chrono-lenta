import React, { useState } from "react"
import { FilterBar } from "@/components/FilterBar"
import { KpiRow } from "@/components/KpiRow"
import { StatisticsBlock } from "@/components/StatisticsBlock"
import { CityGrid } from "@/components/CityGrid"
import { CampaignDetailSheet } from "@/components/CampaignDetailSheet"

export function RebuildAdmin() {
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<number>>(new Set())
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <FilterBar />
      <KpiRow />
      <StatisticsBlock />

      <div className="flex-1 mt-4">
        <CityGrid
          selectedCampaigns={selectedCampaigns}
          onSelectCampaigns={(ids) => setSelectedCampaigns(new Set(ids))}
          onCampaignClick={(id) => setActiveCampaignId(id)}
        />
      </div>

      <CampaignDetailSheet
        campaignId={activeCampaignId}
        onClose={() => setActiveCampaignId(null)}
      />
    </div>
  )
}

export default RebuildAdmin
