import React, { useMemo, useState } from "react"
import { useGetGrid } from "@workspace/api-client-react"
import { useFilterStore } from "@/store/filters"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { formatSeconds } from "@/lib/utils"

interface TotalDurationSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TotalDurationSheet({ open, onOpenChange }: TotalDurationSheetProps) {
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
    query: { queryKey: ["/api/grid", filters.date, filters.cities, filters.format, filters.status, filters.campaignPhase, filters.searchCampaign, filters.searchClient] }
  })

  const shoppingCenters = useMemo(() => {
    if (!gridData) return []
    return gridData.cities.flatMap(city => city.shoppingCenters.map(sc => ({
      id: sc.id,
      number: sc.number,
      city: city.city,
      address: sc.address,
      totalDuration: sc.totalDuration
    })))
  }, [gridData])

  const [selected, setSelected] = useState<Set<number>>(new Set())

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => setSelected(new Set(shoppingCenters.map(sc => sc.id)))
  const clearAll = () => setSelected(new Set())

  const total = useMemo(() => {
    return shoppingCenters.filter(sc => selected.has(sc.id)).reduce((acc, sc) => acc + (sc.totalDuration || 0), 0)
  }, [shoppingCenters, selected])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg w-full p-0">
        <SheetHeader className="p-6 pb-4 border-b bg-muted/10">
          <SheetTitle className="text-xl leading-tight">Общий хронометраж по выбранным ТК</SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-4 overflow-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">Выберите ТК</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll}>Выбрать все</Button>
              <Button size="sm" variant="ghost" onClick={clearAll}>Очистить</Button>
            </div>
          </div>

          <div className="grid gap-2">
            {isLoading && <div className="text-sm text-muted-foreground">Загрузка...</div>}
            {!isLoading && shoppingCenters.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет ТК в данных</div>
            )}

            {shoppingCenters.map(sc => (
              <label key={sc.id} className="flex items-center justify-between p-2 border rounded-md">
                <div className="flex flex-col">
                  <span className="font-medium">ТК №{sc.number} {sc.city ? `— ${sc.city}` : ''}</span>
                  {sc.address && <span className="text-xs text-muted-foreground truncate">{sc.address}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">{formatSeconds(sc.totalDuration || 0)}</span>
                  <Checkbox checked={selected.has(sc.id)} onClick={(e) => { e.stopPropagation(); toggle(sc.id) }} />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-muted/10 mt-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Суммарный хронометраж</div>
              <div className="text-xl font-bold">{formatSeconds(total)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>Закрыть</Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
