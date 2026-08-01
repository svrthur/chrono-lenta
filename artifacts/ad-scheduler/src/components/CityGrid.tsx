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

  // Desired city order and inclusion
  const desiredOrder = [
   'Санкт-Петербург', 'Москва', 'Новосибирск', 'Казань', 'Самара', 'Саратов',
   'Краснодар', 'Красноярск', 'Ростов-на-Дону', 'Уфа', 'Екатеринбург'
  ];

  const cityMap = new Map(gridData.cities.map(c => [c.city, c]));
  const orderedCities = desiredOrder.map(name => cityMap.get(name)).filter(Boolean) as typeof gridData.cities;

  return (
   <div className="flex flex-col gap-6 p-3 max-w-[1920px] mx-auto pb-20">
     <div className="border bg-card rounded-xl shadow-sm overflow-hidden flex flex-col">
       <div className="p-4 border-b bg-muted/20">
         <h2 className="text-xl font-bold text-center">ТК</h2>
       </div>

       <div className="p-4">
         <div className="grid grid-cols-4 gap-3">
           {(() => {
             const allSCs = gridData.cities.flatMap(c => c.shoppingCenters.map(sc => ({ ...sc, city: c.city })));
             const cityIndex = (name: string) => {
               const idx = desiredOrder.indexOf(name);
               return idx === -1 ? desiredOrder.length : idx;
             }
             allSCs.sort((a, b) => {
               const ca = cityIndex(a.city), cb = cityIndex(b.city);
               if (ca !== cb) return ca - cb;
               const na = parseInt(String(a.number).replace(/\D/g, ''), 10);
               const nb = parseInt(String(b.number).replace(/\D/g, ''), 10);
               if (!isNaN(na) && !isNaN(nb)) return na - nb;
               return String(a.number).localeCompare(String(b.number));
             });

             return allSCs.map(sc => (
               <div key={sc.id} className="p-2 border rounded flex flex-col items-center">
                 <span className="font-bold">ТК №{sc.number}</span>
                 <span className="text-xs text-muted-foreground">{sc.city}</span>
               </div>
             ));
           })()}
         </div>
       </div>
     </div>
   </div>
 )
}

function CityCard({ city, selectedCampaigns, onSelectCampaigns, onCampaignClick }: { 
  city: GridCity, 
  selectedCampaigns: Set<number>,
  onSelectCampaigns: (ids: number[]) => void,
  onCampaignClick: (id: number) => void
}) {
  // Ensure shopping centers are ordered: ГМ (HM) first, then СМ, with numeric sort when possible
  const scs = [...city.shoppingCenters].sort((a, b) => {
    if (a.format === b.format) {
      const na = parseInt(String(a.number).replace(/\D/g, ''), 10);
      const nb = parseInt(String(b.number).replace(/\D/g, ''), 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.number).localeCompare(String(b.number));
    }
    if (a.format === 'ГМ') return -1;
    if (b.format === 'ГМ') return 1;
    return String(a.format).localeCompare(String(b.format));
  });

  
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
        <table className="w-full text-sm border-collapse min-w-max text-sm">
          <thead className="bg-muted/40 sticky top-0 z-20">
            <tr>
              <th className="p-3 text-left font-semibold border-b border-r bg-muted/40 sticky left-0 z-30 min-w-[260px]">
                Кампании
              </th>
              {scs.map(sc => (
                <th key={sc.id} className="p-2 border-b border-r text-center group w-[96px] min-w-[96px] max-w-[140px]">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-bold text-sm">ТК №{sc.number}</span>
                    {sc.address && <span className="text-xs text-muted-foreground truncate" title={sc.address}>{sc.address}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Precompute map of shopping center campaigns for quick lookup */}
            {city.campaigns.map((camp) => (
              <tr key={camp.id} className="border-b transition-colors group">
                <td className="p-3 border-r font-medium sticky left-0 z-10 bg-inherit shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                  <div className="flex flex-col">
                    <div 
                      className="text-sm font-semibold cursor-pointer hover:text-primary transition-colors line-clamp-2"
                      onClick={() => onCampaignClick(camp.id)}
                      title={camp.name}
                    >
                      {camp.name}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{camp.duration}с</span>
                      <Checkbox 
                        checked={selectedCampaigns.has(camp.id)}
                        onClick={(e) => toggleCampaign(camp.id, e as any)}
                      />
                    </div>
                  </div>
                </td>

                {scs.map((sc) => {
                  const hasCamp = sc.campaigns.some(c => c.id === camp.id)
                  return (
                    <td key={sc.id} className="border-r p-0 text-center relative">
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
              </tr>
            ))}

            {/* Общий хрон. — строка, последняя под кампаниями */}
            <tr className="border-t font-bold bg-muted/10">
              <td className="p-3 border-r sticky left-0 z-10 bg-inherit">Общий хрон.</td>
              {scs.map((sc) => (
                <td key={sc.id} className="p-3 text-center">
                  {formatSeconds(sc.totalDuration)}
                </td>
              ))}
            </tr>

            {city.shoppingCenters.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, city.shoppingCenters.length) + 1} className="p-8 text-center text-muted-foreground">
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
