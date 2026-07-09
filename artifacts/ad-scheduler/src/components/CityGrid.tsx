import React from "react"
import { useFilterStore } from "@/store/filters"
import { useGetGrid, GridCity, GridShoppingCenterRow, GridCampaignCell } from "@workspace/api-client-react"
import { DURATION_THRESHOLDS } from "@/lib/constants"
import { formatSeconds, cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

interface CityGridProps {
  onSelectCampaigns: (campaignIds: number[]) => void
  selectedCampaigns: Set<number>
  onCampaignClick: (campaignId: number) => void
}

export function CityGrid({ onSelectCampaigns, selectedCampaigns, onCampaignClick }: CityGridProps) {
  const filters = useFilterStore()
  
  const { data: gridData, isLoading } = useGetGrid({
    date: filters.date,
    ...(filters.cities.length > 0 ? { cities: filters.cities } : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    campaignPhase: filters.campaignPhase as any,
    ...(filters.searchCampaign ? { searchCampaign: filters.searchCampaign } : {}),
    ...(filters.searchClient ? { searchClient: filters.searchClient } : {}),
  }, {
    query: {
      queryKey: [
        "/api/grid",
        filters.date, filters.cities, filters.format, filters.status,
        filters.campaignPhase, filters.searchCampaign, filters.searchClient
      ]
    }
  })

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Загрузка данных...</div>
  }

  if (!gridData || gridData.cities.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Нет данных по выбранным фильтрам</div>
  }

  return (
    <div className="flex flex-col gap-8 p-4 max-w-[1920px] mx-auto pb-32">
      {gridData.cities.map((city) => (
        <CityCard 
          key={city.city} 
          city={city} 
          selectedCampaigns={selectedCampaigns}
          onSelectCampaigns={onSelectCampaigns}
          onCampaignClick={onCampaignClick}
        />
      ))}
    </div>
  )
}

function CityCard({ city, selectedCampaigns, onSelectCampaigns, onCampaignClick }: { 
  city: GridCity, 
  selectedCampaigns: Set<number>,
  onSelectCampaigns: (ids: number[]) => void,
  onCampaignClick: (id: number) => void
}) {
  
  const toggleCampaign = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSelection = new Set(selectedCampaigns)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    onSelectCampaigns(Array.from(newSelection))
  }

  return (
    <div className="border bg-card rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b bg-muted/20">
        <h2 className="text-xl font-bold text-center">{city.city}</h2>
      </div>
      
      <div className="relative w-full overflow-auto custom-scrollbar">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead className="bg-muted/40 sticky top-0 z-20">
            <tr>
              <th className="p-3 text-left font-semibold border-b border-r bg-muted/40 sticky left-0 z-30 min-w-[200px]">
                ТК
              </th>
              {city.campaigns.map(camp => (
                <th key={camp.id} className="p-2 border-b border-r text-center group w-[120px] min-w-[120px] max-w-[160px]">
                  <div className="flex flex-col items-center justify-between h-full gap-2">
                    <div 
                      className="text-xs font-semibold cursor-pointer hover:text-primary transition-colors line-clamp-3 w-full"
                      onClick={() => onCampaignClick(camp.id)}
                      title={camp.name}
                    >
                      {camp.name}
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                        {camp.duration}с
                      </span>
                      <Checkbox 
                        checked={selectedCampaigns.has(camp.id)}
                        onClick={(e) => toggleCampaign(camp.id, e as any)}
                      />
                    </div>
                  </div>
                </th>
              ))}
              <th className="p-3 border-b text-center font-bold bg-muted/40 sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                Общий хрон.
              </th>
            </tr>
          </thead>
          <tbody>
            {city.shoppingCenters.map((row) => (
              <Row 
                key={row.id} 
                row={row} 
                allCampaigns={city.campaigns} 
                onCampaignClick={onCampaignClick}
              />
            ))}
            {city.shoppingCenters.length === 0 && (
              <tr>
                <td colSpan={city.campaigns.length + 2} className="p-8 text-center text-muted-foreground">
                  Нет ТК в этом городе с активными кампаниями по выбранным фильтрам
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ row, allCampaigns, onCampaignClick }: { row: GridShoppingCenterRow, allCampaigns: GridCampaignCell[], onCampaignClick: (id: number) => void }) {
  const getRowColorClass = (duration: number) => {
    if (duration >= DURATION_THRESHOLDS.ORANGE_MAX) return "bg-status-red hover:brightness-95";
    if (duration >= DURATION_THRESHOLDS.YELLOW_MAX) return "bg-status-orange hover:brightness-95";
    if (duration >= DURATION_THRESHOLDS.GREEN_MAX) return "bg-status-yellow hover:brightness-95";
    return "bg-status-green hover:brightness-95";
  }

  // Create a map for quick lookup
  const rowCampaigns = new Map(row.campaigns.map(c => [c.id, c]))

  return (
    <tr className={cn("border-b transition-colors group", getRowColorClass(row.totalDuration))}>
      <td className="p-3 border-r font-medium sticky left-0 z-10 bg-inherit shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col">
          <span className="font-bold text-foreground">ТК №{row.number}</span>
          {row.address && <span className="text-xs text-muted-foreground truncate" title={row.address}>{row.address}</span>}
        </div>
      </td>
      
      {allCampaigns.map(camp => {
        const hasCamp = rowCampaigns.has(camp.id);
        return (
          <td 
            key={camp.id} 
            className="border-r p-0 text-center relative"
          >
            {hasCamp ? (
              <div 
                className="w-full h-full min-h-[48px] flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                onClick={() => onCampaignClick(camp.id)}
              >
                <div className="w-4 h-4 rounded-full bg-primary/80 shadow-sm" title={camp.name} />
              </div>
            ) : (
              <div className="w-full h-full min-h-[48px]" />
            )}
          </td>
        )
      })}
      
      <td className="p-3 text-center font-bold sticky right-0 bg-inherit shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
        {formatSeconds(row.totalDuration)}
      </td>
    </tr>
  )
}
