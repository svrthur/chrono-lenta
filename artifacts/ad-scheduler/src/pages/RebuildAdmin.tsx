import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format, addDays } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  ArrowUpDown,
  LayoutGrid,
  ListFilter,
  Search,
  RotateCcw,
  AlertTriangle,
  Download,
  Clock,
} from "lucide-react"
import { CITIES, MASTER_TK_LIST, TK_QUOTAS } from "@/lib/constants"
import { getApiUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

type CampaignRow = {
  id: number
  name: string
  client: string
  duration: number
  status: string
  tkType?: string | null
  startDate: string
  endDate: string
  note?: string | null
  shoppingCenters?: { id: number; number: string; city: string; format: string }[]
}

export type CampaignStatusLabel = "опубликовано" | "запланировано" | "завершён"

async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) throw new Error("Ошибка загрузки данных")
  return res.json()
}

function formatShortDate(iso: string) {
  if (!iso) return ""
  const parts = iso.split("-")
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : iso
}

export function RebuildAdmin() {
  const { data: rawCampaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  const [viewMode, setViewMode] = useState<"list" | "matrix">("list")
  const [tkFormatFilter, setTkFormatFilter] = useState<"ALL" | "ГМ" | "СМ">("ALL")
  const [cityFilter, setCityFilter] = useState<string>("")
  const [searchTk, setSearchTk] = useState<string>("")
  const [onlyWithAds, setOnlyWithAds] = useState<boolean>(false)
  const [onlyOverLimit, setOnlyOverLimit] = useState<boolean>(false)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [statusFilter, setStatusFilter] = useState<
    "active_and_planned" | "all" | "опубликовано" | "запланировано" | "завершён"
  >("active_and_planned")

  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>("")
  const [campaignFormatFilter, setCampaignFormatFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState<boolean>(false)

  const [sortBy, setSortBy] = useState<"client" | "format" | "type" | "duration" | "status" | "name">("client")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const dateIso = format(selectedDate, "yyyy-MM-dd")
  const in3DaysIso = format(addDays(selectedDate, 3), "yyyy-MM-dd")

  const enrichedCampaigns = useMemo(() => {
    return rawCampaigns.map((c) => {
      const isPaid =
        c.status === "Платник" ||
        c.status === "платный" ||
        (c.note && c.note.toLowerCase().includes("платн") && !c.note.toLowerCase().includes("не "))
      const typeLabel = isPaid ? "платный" : "не платный"
      const formatLabel =
        c.tkType ||
        (c as any).tk_type ||
        Array.from(new Set((c.shoppingCenters || []).map((s) => s.format))).join(", ") ||
        "ГМ"
      const scNumbersSet = new Set((c.shoppingCenters || []).map((s) => String(s.number).trim()))

      let statusOnDate: CampaignStatusLabel = "опубликовано"
      if (c.startDate > dateIso) statusOnDate = "запланировано"
      else if (c.endDate < dateIso) statusOnDate = "завершён"

      const isExpiringSoon =
        statusOnDate === "опубликовано" && c.endDate >= dateIso && c.endDate <= in3DaysIso

      return {
        ...c,
        _isPaid: Boolean(isPaid),
        _type: typeLabel,
        _format: formatLabel,
        _scNumbersSet: scNumbersSet,
        _statusOnDate: statusOnDate,
        _isExpiringSoon: isExpiringSoon,
      }
    })
  }, [rawCampaigns, dateIso, in3DaysIso])

  const allClients = useMemo(
    () => Array.from(new Set(enrichedCampaigns.map((c) => c.client))).filter(Boolean).sort(),
    [enrichedCampaigns]
  )

  const baseFilteredCampaigns = useMemo(() => {
    const list = enrichedCampaigns.filter((c) => {
      if (campaignTypeFilter && c._type !== campaignTypeFilter) return false
      if (campaignFormatFilter && c._format !== campaignFormatFilter) return false
      if (clientFilter && c.client !== clientFilter) return false
      if (onlyExpiringSoon && !c._isExpiringSoon) return false
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.client.toLowerCase().includes(q)) return false
      }
      return true
    })

    list.sort((a, b) => {
      const getVal = (item: typeof a) => {
        if (sortBy === "client") return item.client.toLowerCase()
        if (sortBy === "format") return item._format.toLowerCase()
        if (sortBy === "type") return item._type.toLowerCase()
        if (sortBy === "status") return item._statusOnDate
        if (sortBy === "duration") return item.duration
        return item.name.toLowerCase()
      }
      const valA = getVal(a)
      const valB = getVal(b)
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return list
  }, [
    enrichedCampaigns,
    campaignTypeFilter,
    campaignFormatFilter,
    clientFilter,
    onlyExpiringSoon,
    searchQuery,
    sortBy,
    sortDir,
  ])

  const publishedCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._statusOnDate === "опубликовано"),
    [baseFilteredCampaigns]
  )
  const plannedCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._statusOnDate === "запланировано"),
    [baseFilteredCampaigns]
  )
  const finishedCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._statusOnDate === "завершён"),
    [baseFilteredCampaigns]
  )

  const displayedCampaigns = useMemo(() => {
    if (statusFilter === "опубликовано") return publishedCampaigns
    if (statusFilter === "запланировано") return plannedCampaigns
    if (statusFilter === "завершён") return finishedCampaigns
    if (statusFilter === "all") return baseFilteredCampaigns
    return [...publishedCampaigns, ...plannedCampaigns]
  }, [statusFilter, publishedCampaigns, plannedCampaigns, finishedCampaigns, baseFilteredCampaigns])

  const filteredTkRows = useMemo(() => {
    return MASTER_TK_LIST.map((tk) => {
      const activeList = publishedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const plannedList = plannedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const shownList = displayedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))

      const paidDuration = activeList
        .filter((c) => c._isPaid)
        .reduce((sum, c) => sum + (c.duration || 0), 0)
      const freeDuration = activeList
        .filter((c) => !c._isPaid)
        .reduce((sum, c) => sum + (c.duration || 0), 0)
      const totalDuration = paidDuration + freeDuration
      const plannedDuration = plannedList.reduce((sum, c) => sum + (c.duration || 0), 0)

      let earliestEndDate: string | null = null
      let freedSeconds = 0
      if (activeList.length > 0) {
        const sortedEndDates = activeList.map((c) => c.endDate).sort()
        earliestEndDate = sortedEndDates[0]
        freedSeconds = activeList
          .filter((c) => c.endDate === earliestEndDate)
          .reduce((sum, c) => sum + (c.duration || 0), 0)
      }

      const isOverTotal = totalDuration > TK_QUOTAS.TOTAL_MAX
      const isOverPaid = paidDuration > TK_QUOTAS.PAID_MAX
      const isOverFree = freeDuration > TK_QUOTAS.FREE_MAX
      const isOverLimit = isOverTotal || isOverPaid || isOverFree

      return {
        ...tk,
        activeList,
        plannedList,
        shownList,
        totalDuration,
        paidDuration,
        freeDuration,
        plannedDuration,
        earliestEndDate,
        freedSeconds,
        isOverTotal,
        isOverPaid,
        isOverFree,
        isOverLimit,
      }
    }).filter((tk) => {
      if (tkFormatFilter !== "ALL" && tk.format !== tkFormatFilter) return false
      if (cityFilter && tk.city !== cityFilter) return false
      if (onlyWithAds && tk.shownList.length === 0) return false
      if (onlyOverLimit && !tk.isOverLimit) return false
      if (searchTk.trim()) {
        const q = searchTk.trim().toLowerCase()
        if (
          !tk.number.toLowerCase().includes(q) &&
          !tk.address.toLowerCase().includes(q) &&
          !tk.city.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [
    tkFormatFilter,
    cityFilter,
    onlyWithAds,
    onlyOverLimit,
    searchTk,
    publishedCampaigns,
    plannedCampaigns,
    displayedCampaigns,
  ])

  const stats = useMemo(() => {
    const visibleTkNums = new Set(filteredTkRows.map((t) => t.number))
    const inVisible = (list: typeof publishedCampaigns) =>
      list.filter((c) => Array.from(c._scNumbersSet).some((num) => visibleTkNums.has(num)))

    const pubVis = inVisible(publishedCampaigns)
    const planVis = inVisible(plannedCampaigns)
    const finVis = inVisible(finishedCampaigns)

    return {
      totalTk: filteredTkRows.length,
      gmCount: filteredTkRows.filter((t) => t.format === "ГМ").length,
      smCount: filteredTkRows.filter((t) => t.format === "СМ").length,
      tkBroadcastingCount: filteredTkRows.filter((t) => t.activeList.length > 0).length,
      tkPlannedCount: filteredTkRows.filter((t) => t.plannedList.length > 0).length,
      overLimitTkCount: filteredTkRows.filter((t) => t.isOverLimit).length,
      expiringCount: pubVis.filter((c) => c._isExpiringSoon).length,
      publishedCount: pubVis.length,
      plannedCount: planVis.length,
      finishedCount: finVis.length,
    }
  }, [filteredTkRows, publishedCampaigns, plannedCampaigns, finishedCampaigns])

  const handleExportTkCsv = () => {
    const headers = [
      "№ ТК",
      "Формат",
      "Город",
      "Адрес",
      `Суммарно сек (лимит ${TK_QUOTAS.TOTAL_MAX})`,
      `Платно сек (лимит ${TK_QUOTAS.PAID_MAX})`,
      `Бесплатно сек (лимит ${TK_QUOTAS.FREE_MAX})`,
      "План (сек)",
      "Ближайшее освобождение",
      "Активные и выбранные РК",
    ]
    const csvRows = filteredTkRows.map((tk) => [
      tk.number,
      tk.format,
      `"${tk.city}"`,
      `"${tk.address.replace(/"/g, '""')}"`,
      tk.totalDuration,
      tk.paidDuration,
      tk.freeDuration,
      tk.plannedDuration,
      tk.earliestEndDate ? `-${tk.freedSeconds}с после ${tk.earliestEndDate}` : "—",
      `"${tk.shownList
        .map((c) => `${c.name} (${c.client},${c.duration}с, ${c._type},${c._statusOnDate})`)
        .join(" | ")
        .replace(/"/g, '""')}"`,
    ])
    const content = "\uFEFF" + [headers.join(";"), ...csvRows.map((r) => r.join(";"))].join("\r\n")
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `экраны_ТК_${dateIso}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => {
    setTkFormatFilter("ALL")
    setCityFilter("")
    setSearchTk("")
    setOnlyWithAds(false)
    setOnlyOverLimit(false)
    setOnlyExpiringSoon(false)
    setSelectedDate(new Date())
    setStatusFilter("active_and_planned")
    setCampaignTypeFilter("")
    setCampaignFormatFilter("")
    setClientFilter("")
    setSearchQuery("")
    setSortBy("client")
    setSortDir("asc")
  }

  const getStatusBadge = (status: CampaignStatusLabel, startDate?: string) => {
    if (status === "опубликовано") {
      return (
        <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          опубликовано
        </span>
      )
    }
    if (status === "запланировано") {
      return (
        <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
          запланировано {startDate ? `(с ${formatShortDate(startDate)})` : ""}
        </span>
      )
    }
    return (
      <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
        завершён
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-10">
      <div className="bg-card border-b shadow-2xs sticky top-[53px] z-40">
        <div className="max-w-[1920px] mx-auto px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded border bg-muted/40 p-0.5">
                {(["ALL", "ГМ", "СМ"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setTkFormatFilter(fmt)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                      tkFormatFilter === fmt
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {fmt === "ALL" ? "Все (173)" : fmt === "ГМ" ? "ГМ (94)" : "СМ (79)"}
                  </button>
                ))}
              </div>

              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="border rounded px-2.5 py-1 text-xs bg-background font-medium h-7"
              >
                <option value="">Все города ({CITIES.length})</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs justify-start text-left font-semibold border-primary/40"
                  >
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    Дата расчета: {format(selectedDate, "dd.MM.yyyy", { locale: ru })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    locale={ru}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <div className="inline-flex rounded border bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setStatusFilter("active_and_planned")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    statusFilter === "active_and_planned"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Опубликовано + План ({stats.publishedCount + stats.plannedCount})
                </button>
                <button
                  onClick={() => setStatusFilter("опубликовано")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    statusFilter === "опубликовано"
                      ? "bg-emerald-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Опубликовано ({stats.publishedCount})
                </button>
                <button
                  onClick={() => setStatusFilter("запланировано")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    statusFilter === "запланировано"
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Запланировано ({stats.plannedCount})
                </button>
                <button
                  onClick={() => setStatusFilter("завершён")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    statusFilter === "завершён"
                      ? "bg-zinc-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Завершён ({stats.finishedCount})
                </button>
                <button
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    statusFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Все ({stats.publishedCount + stats.plannedCount + stats.finishedCount})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="№ ТК или адрес..."
                  value={searchTk}
                  onChange={(e) => setSearchTk(e.target.value)}
                  className="pl-6 h-7 w-[140px] text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={handleExportTkCsv}
              >
                <Download className="w-3.5 h-3.5" />
                Скачать Excel
              </Button>

              <div className="inline-flex rounded border bg-muted/40 p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "list"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Список ТК
                </button>
                <button
                  onClick={() => setViewMode("matrix")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "matrix"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Матрица
                </button>
              </div>

              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Сброс
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Тип:</span>
                <select
                  value={campaignTypeFilter}
                  onChange={(e) => setCampaignTypeFilter(e.target.value)}
                  className="border rounded px-2 py-0.5 bg-background h-6 text-xs"
                >
                  <option value="">Все</option>
                  <option value="платный">платный</option>
                  <option value="не платный">не платный</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Формат РК:</span>
                <select
                  value={campaignFormatFilter}
                  onChange={(e) => setCampaignFormatFilter(e.target.value)}
                  className="border rounded px-2 py-0.5 bg-background h-6 text-xs"
                >
                  <option value="">Все</option>
                  <option value="ГМ">ГМ</option>
                  <option value="СМ">СМ</option>
                  <option value="ГМ+СМ">ГМ+СМ</option>
                  <option value="част.ГМ">част.ГМ</option>
                  <option value="част.СМ">част.СМ</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Заказчик:</span>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="border rounded px-2 py-0.5 bg-background h-6 text-xs max-w-[160px]"
                >
                  <option value="">Все</option>
                  {allClients.map((cl) => (
                    <option key={cl} value={cl}>
                      {cl}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                placeholder="Поиск ролика / заказчика..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 w-[150px] text-xs px-2"
              />

              <label className="flex items-center gap-1 cursor-pointer select-none text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyWithAds}
                  onChange={(e) => setOnlyWithAds(e.target.checked)}
                />
                Только ТК с РК
              </label>

              <label className="flex items-center gap-1 cursor-pointer select-none text-amber-700 dark:text-amber-400 font-medium">
                <input
                  type="checkbox"
                  checked={onlyExpiringSoon}
                  onChange={(e) => setOnlyExpiringSoon(e.target.checked)}
                />
                Истекают ≤ 3 дн. ({stats.expiringCount})
              </label>

              <label className="flex items-center gap-1 cursor-pointer select-none text-red-600 dark:text-red-400 font-medium">
                <input
                  type="checkbox"
                  checked={onlyOverLimit}
                  onChange={(e) => setOnlyOverLimit(e.target.checked)}
                />
                Превышение лимита ({stats.overLimitTkCount})
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Сортировка:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border rounded px-2 py-0.5 bg-background font-medium h-6 text-xs"
              >
                <option value="client">По заказчику</option>
                <option value="type">По типу</option>
                <option value="format">По формату</option>
                <option value="status">По статусу</option>
                <option value="duration">По длительности</option>
                <option value="name">По названию</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              >
                <ArrowUpDown className="w-3 h-3 mr-1" />
                {sortDir === "asc" ? "А→Я" : "Я→А"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] w-full mx-auto px-3 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="bg-card border rounded px-3 py-1.5">
            <div className="text-[11px] text-muted-foreground">Показано ТК</div>
            <div className="text-sm font-bold">
              {stats.totalTk}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (ГМ: {stats.gmCount}, СМ: {stats.smCount})
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              Опубликовано на {format(selectedDate, "dd.MM.yyyy")}
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {stats.publishedCount} РК{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (в {stats.tkBroadcastingCount} ТК)
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-1.5">
            <div className="text-[11px] text-muted-foreground">
              Запланировано (после {format(selectedDate, "dd.MM")})
            </div>
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {stats.plannedCount} РК{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (в {stats.tkPlannedCount} ТК)
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-1.5">
            <div className="text-[11px] text-muted-foreground">Квота ТК (кратно 5 сек)</div>
            <div className="text-xs font-semibold mt-0.5">
              Всего: <span className="font-bold">{TK_QUOTAS.TOTAL_MAX}с</span>{" "}
              <span className="text-muted-foreground">
                (Платно 70%: <strong className="text-foreground">{TK_QUOTAS.PAID_MAX}с</strong> • Беспл. 30%:{" "}
                <strong className="text-foreground">{TK_QUOTAS.FREE_MAX}с</strong>)
              </span>
            </div>
          </div>

          <div
            className={cn(
              "border rounded px-3 py-1.5",
              stats.overLimitTkCount > 0
                ? "bg-red-500/15 border-red-500 text-red-700 dark:text-red-300"
                : "bg-card"
            )}
          >
            <div className="text-[11px] opacity-80">Превышение лимитов в ТК</div>
            <div className="text-sm font-bold flex items-center gap-1">
              {stats.overLimitTkCount > 0 && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {stats.overLimitTkCount} ТК
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] w-full mx-auto px-3 mt-2 flex-1">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground bg-card border rounded text-xs">
            Загрузка расписания...
          </div>
        ) : viewMode === "list" ? (
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r w-[54px]">№ ТК</th>
                    <th className="px-1.5 py-1.5 text-center border-r w-[48px]">Форм.</th>
                    <th className="px-2 py-1.5 text-left border-r w-[130px]">Город</th>
                    <th className="px-2 py-1.5 text-left border-r w-[210px]">Адрес</th>
                    <th className="px-2 py-1.5 text-center border-r w-[96px]">
                      Суммарно (≤{TK_QUOTAS.TOTAL_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[96px]">
                      Платно 70% (≤{TK_QUOTAS.PAID_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[96px]">
                      Беспл. 30% (≤{TK_QUOTAS.FREE_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[115px]">
                      Освободится / План
                    </th>
                    <th className="px-2 py-1.5 text-left">
                      Рекламные кампании на {format(selectedDate, "dd.MM.yyyy")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTkRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        Нет ТК по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {filteredTkRows.map((tk) => (
                    <tr
                      key={tk.number}
                      className={cn(
                        "border-b transition-colors align-middle",
                        tk.isOverLimit ? "bg-red-500/10 hover:bg-red-500/15" : "hover:bg-muted/20"
                      )}
                    >
                      <td
                        className={cn(
                          "px-2 py-1 font-bold border-r whitespace-nowrap",
                          tk.isOverLimit && "bg-red-600 text-white"
                        )}
                      >
                        №{tk.number}
                      </td>
                      <td className="px-1.5 py-1 text-center border-r">
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold",
                            tk.format === "ГМ" ? "bg-primary/15 text-primary" : "bg-muted text-foreground"
                          )}
                        >
                          {tk.format}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-medium border-r whitespace-nowrap">{tk.city}</td>
                      <td
                        className="px-2 py-1 text-foreground/90 border-r truncate max-w-[210px]"
                        title={tk.address}
                      >
                        {tk.address}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1 text-center border-r whitespace-nowrap font-mono font-bold",
                          tk.isOverTotal
                            ? "bg-red-600 text-white"
                            : tk.isOverLimit
                            ? "text-red-700 dark:text-red-400"
                            : tk.totalDuration > 0
                            ? "text-foreground"
                            : "text-muted-foreground font-normal"
                        )}
                      >
                        {tk.totalDuration} / {TK_QUOTAS.TOTAL_MAX}с
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1 text-center border-r whitespace-nowrap font-mono",
                          tk.isOverPaid
                            ? "bg-red-600 text-white font-bold"
                            : tk.paidDuration > 0
                            ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                            : "text-muted-foreground"
                        )}
                      >
                        {tk.paidDuration} / {TK_QUOTAS.PAID_MAX}с
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1 text-center border-r whitespace-nowrap font-mono",
                          tk.isOverFree
                            ? "bg-red-600 text-white font-bold"
                            : tk.freeDuration > 0
                            ? "text-amber-700 dark:text-amber-400 font-semibold"
                            : "text-muted-foreground"
                        )}
                      >
                        {tk.freeDuration} / {TK_QUOTAS.FREE_MAX}с
                      </td>
                      <td className="px-2 py-1 text-center border-r whitespace-nowrap">
                        <div className="flex flex-col items-center gap-0.5">
                          {tk.earliestEndDate && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                              title={`После ${tk.earliestEndDate} освободится ${tk.freedSeconds} сек`}
                            >
                              <Clock className="w-2.5 h-2.5" />-{tk.freedSeconds}с с{" "}
                              {formatShortDate(tk.earliestEndDate)}
                            </span>
                          )}
                          {tk.plannedList.length > 0 && (
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400">
                              План: {tk.plannedList.length} РК ({tk.plannedDuration}с)
                            </span>
                          )}
                          {!tk.earliestEndDate && tk.plannedList.length === 0 && (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        {tk.shownList.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tk.shownList.map((camp) => (
                              <div
                                key={camp.id}
                                className={cn(
                                  "inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px]",
                                  camp._statusOnDate === "запланировано"
                                    ? "bg-blue-500/10 border-blue-500/30"
                                    : camp._statusOnDate === "завершён"
                                    ? "bg-zinc-500/10 border-zinc-500/30 opacity-75"
                                    : "bg-background border-border"
                                )}
                                title={`${camp.name} | Заказчик: ${camp.client} | Статус: ${camp._statusOnDate} | Формат: ${camp._format} | Тип: ${camp._type} | Период: ${camp.startDate} — ${camp.endDate}`}
                              >
                                <span className="font-semibold">{camp.name}</span>
                                <span className="text-muted-foreground">({camp.client})</span>
                                <span className="font-mono font-bold text-primary">{camp.duration}с</span>
                                <span className="text-[10px] px-1 rounded bg-muted">{camp._format}</span>
                                <span
                                  className={cn(
                                    "text-[10px] font-medium",
                                    camp._isPaid
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  )}
                                >
                                  {camp._type}
                                </span>
                                {getStatusBadge(camp._statusOnDate, camp.startDate)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-auto max-h-[78vh]">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead className="bg-muted/60 sticky top-0 z-20">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-b border-r sticky left-0 z-30 bg-muted min-w-[280px]">
                      Кампания / Заказчик / Статус на {format(selectedDate, "dd.MM.yyyy")}
                    </th>
                    {filteredTkRows.map((tk) => (
                      <th
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-b border-r text-center min-w-[68px] max-w-[78px]",
                          tk.isOverLimit && "bg-red-600 text-white"
                        )}
                        title={`ТК №${tk.number} (${tk.city}, ${tk.address}) | Суммарно: ${tk.totalDuration}/${TK_QUOTAS.TOTAL_MAX}с | Платно: ${tk.paidDuration}/${TK_QUOTAS.PAID_MAX}с | Беспл.: ${tk.freeDuration}/${TK_QUOTAS.FREE_MAX}с`}
                      >
                        <div className="font-bold text-[11px]">№{tk.number}</div>
                        <div
                          className={cn(
                            "text-[9px]",
                            tk.isOverLimit ? "text-white/90" : "text-muted-foreground"
                          )}
                        >
                          {tk.format} • {tk.totalDuration}с
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedCampaigns.length === 0 && (
                    <tr>
                      <td
                        colSpan={filteredTkRows.length + 1}
                        className="p-6 text-center text-muted-foreground"
                      >
                        Нет рекламных кампаний по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {displayedCampaigns.map((camp) => (
                    <tr key={camp.id} className="border-b hover:bg-muted/20">
                      <td className="px-2 py-1 border-r sticky left-0 z-10 bg-card">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs truncate">{camp.name}</span>
                          {getStatusBadge(camp._statusOnDate, camp.startDate)}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span className="font-medium text-foreground">{camp.client}</span>
                          <span>•</span>
                          <span className="font-mono font-semibold">{camp.duration}с</span>
                          <span>•</span>
                          <span>{camp._format}</span>
                          <span>•</span>
                          <span
                            className={cn(
                              camp._isPaid
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {camp._type}
                          </span>
                        </div>
                      </td>
                      {filteredTkRows.map((tk) => {
                        const isPlaced = camp._scNumbersSet.has(tk.number)
                        return (
                          <td
                            key={tk.number}
                            className={cn(
                              "border-r px-0.5 py-1 text-center",
                              tk.isOverLimit && "bg-red-500/10"
                            )}
                          >
                            {isPlaced ? (
                              <span
                                className={cn(
                                  "inline-block px-1 py-0.2 rounded font-bold text-[10px]",
                                  camp._statusOnDate === "запланировано"
                                    ? "bg-blue-600/20 text-blue-700 dark:text-blue-300"
                                    : camp._statusOnDate === "завершён"
                                    ? "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400"
                                    : "bg-primary text-primary-foreground"
                                )}
                              >
                                {camp.duration}с
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  <tr className="bg-muted/40 font-bold border-t-2 text-[11px]">
                    <td className="px-2 py-1 border-r sticky left-0 z-10 bg-muted">
                      Суммарно в эфире (лимит {TK_QUOTAS.TOTAL_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r text-center font-mono",
                          tk.isOverTotal
                            ? "bg-red-600 text-white"
                            : tk.isOverLimit
                            ? "bg-red-500/20 text-red-700 dark:text-red-300"
                            : ""
                        )}
                      >
                        {tk.totalDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="bg-muted/20 text-[10px]">
                    <td className="px-2 py-1 border-r sticky left-0 z-10 bg-muted font-medium">
                      Платно 70% (лимит {TK_QUOTAS.PAID_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r text-center font-mono",
                          tk.isOverPaid
                            ? "bg-red-600 text-white font-bold"
                            : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {tk.paidDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="bg-muted/20 text-[10px] border-b">
                    <td className="px-2 py-1 border-r sticky left-0 z-10 bg-muted font-medium">
                      Бесплатно 30% (лимит {TK_QUOTAS.FREE_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r text-center font-mono",
                          tk.isOverFree
                            ? "bg-red-600 text-white font-bold"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {tk.freeDuration}с
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RebuildAdmin
