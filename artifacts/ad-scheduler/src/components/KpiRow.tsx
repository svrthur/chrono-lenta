import React from "react"
import { useGetKpi } from "@workspace/api-client-react"
import { useFilterStore } from "@/store/filters"
import { Card, CardContent } from "@/components/ui/card"
import { formatSeconds } from "@/lib/utils"

export function KpiRow() {
  const filters = useFilterStore()
  
  const { data: kpi, isLoading } = useGetKpi({
    date: filters.date,
    cities: filters.cities,
  }, {
    query: {
      queryKey: ["/api/kpi", filters.date, filters.cities]
    }
  })

  if (isLoading || !kpi) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 max-w-[1920px] mx-auto animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="p-4 h-[88px]"></CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const metrics = [
    { label: "Активных кампаний", value: kpi.activeCampaigns },
    { label: "Заказчиков", value: kpi.uniqueClients },
    { label: "Всего ТК", value: kpi.totalShoppingCenters },
    { label: "Общий хронометраж", value: formatSeconds(kpi.totalDuration) },
    { label: "Средний хрон. на ТК", value: formatSeconds(kpi.avgDurationPerSc) },
    { label: "Самый загруженный ТК", value: kpi.busiestScNumber || "—" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-4 py-2 max-w-[1920px] mx-auto bg-background/50">
      {metrics.map((m, i) => (
        <Card key={i} className="rounded-lg shadow-sm border border-border/60">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{m.label}</p>
            <p className="text-xl font-bold text-foreground leading-none">{m.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
