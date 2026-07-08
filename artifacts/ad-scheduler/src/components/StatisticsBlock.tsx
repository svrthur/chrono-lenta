import React from "react"
import { useGetStatistics } from "@workspace/api-client-react"
import { useFilterStore } from "@/store/filters"
import { formatSeconds } from "@/lib/utils"

export function StatisticsBlock() {
  const filters = useFilterStore()
  
  const { data: stats } = useGetStatistics({
    date: filters.date,
    cities: filters.cities,
    format: filters.format,
  }, {
    query: {
      queryKey: ["/api/statistics", filters.date, filters.cities, filters.format]
    }
  })

  if (!stats) return null

  const items = [
    { label: "Общий", value: stats.totalDuration },
    { label: "Платник", value: stats.paidDuration },
    { label: "Не платник", value: stats.unpaidDuration },
    { label: "ГМ", value: stats.gmDuration },
    { label: "СМ", value: stats.smDuration },
    { label: "ГМ + СМ", value: stats.gmSmDuration },
  ]

  return (
    <div className="flex flex-wrap items-center gap-6 px-4 py-3 max-w-[1920px] mx-auto border-b bg-card/50">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{item.label}:</span>
          <span className="text-sm font-semibold">{formatSeconds(item.value)}</span>
        </div>
      ))}
    </div>
  )
}
