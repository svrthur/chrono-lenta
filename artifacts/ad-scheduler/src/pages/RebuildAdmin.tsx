import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  ArrowUpDown,
  LayoutGrid,
  ListFilter,
  Search,
  RotateCcw,
} from "lucide-react"
import { CITIES, MASTER_TK_LIST, DURATION_THRESHOLDS } from "@/lib/constants"
import { getApiUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) throw new Error("Ошибка загрузки данных")
  return res.json()
}

export function RebuildAdmin() {
  const { data: rawCampaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  // Режим отображения: "list" (Общий список ТК) или "matrix" (Матрица Кампании × ТК)
  const [viewMode, setViewMode] = useState<"list" | "matrix">("list")

  // Фильтры ТК
  const [tkFormatFilter, setTkFormatFilter] = useState<"ALL" | "ГМ" | "СМ">("ALL")
  const [cityFilter, setCityFilter] = useState<string>("")
  const [searchTk, setSearchTk] = useState<string>("")
  const [onlyWithActiveAds, setOnlyWithActiveAds] = useState<boolean>(false)

  // Фильтры кампаний и дат
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [allDates, setAllDates] = useState<boolean>(false)
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>("")
  const [campaignFormatFilter, setCampaignFormatFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // Сортировка кампаний (по типу, формату, заказчику, длительности)
  const [sortBy, setSortBy] = useState<"client" | "format" | "type" | "duration" | "name">("client")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const dateIso = selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""

  // Обогащаем кампании вычисляемыми полями Тип и Формат
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

      return {
        ...c,
        _type: typeLabel,
        _format: formatLabel,
        _scNumbersSet: scNumbersSet,
      }
    })
  }, [rawCampaigns])

  // Уникальные заказчики для выпадающего фильтра
  const allClients = useMemo(
    () => Array.from(new Set(enrichedCampaigns.map((c) => c.client))).filter(Boolean).sort(),
    [enrichedCampaigns]
  )

  // Фильтрация и сортировка кампаний
  const filteredAndSortedCampaigns = useMemo(() => {
    const list = enrichedCampaigns.filter((c) => {
      if (!allDates && dateIso) {
        if (c.startDate > dateIso || c.endDate < dateIso) return false
      }
      if (campaignTypeFilter && c._type !== campaignTypeFilter) return false
      if (campaignFormatFilter && c._format !== campaignFormatFilter) return false
      if (clientFilter && c.client !== clientFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = c.name.toLowerCase().includes(q)
        const matchClient = c.client.toLowerCase().includes(q)
        if (!matchName && !matchClient) return false
      }
      return true
    })

    list.sort((a, b) => {
      let valA: string | number = ""
      let valB: string | number = ""

      if (sortBy === "client") {
        valA = a.client.toLowerCase()
        valB = b.client.toLowerCase()
      } else if (sortBy === "format") {
        valA = a._format.toLowerCase()
        valB = b._format.toLowerCase()
      } else if (sortBy === "type") {
        valA = a._type.toLowerCase()
        valB = b._type.toLowerCase()
      } else if (sortBy === "duration") {
        valA = a.duration
        valB = b.duration
      } else {
        valA = a.name.toLowerCase()
        valB = b.name.toLowerCase()
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return list
  }, [
    enrichedCampaigns,
    allDates,
    dateIso,
    campaignTypeFilter,
    campaignFormatFilter,
    clientFilter,
    searchQuery,
    sortBy,
    sortDir,
  ])

  // Сопоставляем эталонный список 173 ТК с активными отсортированными кампаниями
  const filteredTkRows = useMemo(() => {
    return MASTER_TK_LIST.map((tk) => {
      const activeCampaigns = filteredAndSortedCampaigns.filter((c) =>
        c._scNumbersSet.has(tk.number)
      )
      const totalDuration = activeCampaigns.reduce((sum, c) => sum + (c.duration || 0), 0)
      return {
        ...tk,
        activeCampaigns,
        totalDuration,
      }
    }).filter((tk) => {
      if (tkFormatFilter !== "ALL" && tk.format !== tkFormatFilter) return false
      if (cityFilter && tk.city !== cityFilter) return false
      if (onlyWithActiveAds && tk.activeCampaigns.length === 0) return false
      if (searchTk.trim()) {
        const q = searchTk.trim().toLowerCase()
        const matchNum = tk.number.toLowerCase().includes(q)
        const matchAddr = tk.address.toLowerCase().includes(q)
        const matchCity = tk.city.toLowerCase().includes(q)
        if (!matchNum && !matchAddr && !matchCity) return false
      }
      return true
    })
  }, [tkFormatFilter, cityFilter, onlyWithActiveAds, searchTk, filteredAndSortedCampaigns])

  // Сводная статистика по текущей выборке
  const stats = useMemo(() => {
    const totalTk = filteredTkRows.length
    const gmCount = filteredTkRows.filter((t) => t.format === "ГМ").length
    const smCount = filteredTkRows.filter((t) => t.format === "СМ").length
    const tkWithAds = filteredTkRows.filter((t) => t.activeCampaigns.length > 0).length
    const totalSecAllTk = filteredTkRows.reduce((s, t) => s + t.totalDuration, 0)
    const avgSec = totalTk > 0 ? Math.round(totalSecAllTk / totalTk) : 0
    return {
      totalTk,
      gmCount,
      smCount,
      tkWithAds,
      activeCampaignsCount: filteredAndSortedCampaigns.length,
      avgSec,
    }
  }, [filteredTkRows, filteredAndSortedCampaigns])

  const resetFilters = () => {
    setTkFormatFilter("ALL")
    setCityFilter("")
    setSearchTk("")
    setOnlyWithActiveAds(false)
    setSelectedDate(new Date())
    setAllDates(false)
    setCampaignTypeFilter("")
    setCampaignFormatFilter("")
    setClientFilter("")
    setSearchQuery("")
    setSortBy("client")
    setSortDir("asc")
  }

  const getDurationBadgeClass = (sec: number) => {
    if (sec === 0) return "bg-muted text-muted-foreground"
    if (sec > DURATION_THRESHOLDS.ORANGE_MAX) return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
    if (sec > DURATION_THRESHOLDS.YELLOW_MAX) return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"
    if (sec > DURATION_THRESHOLDS.GREEN_MAX) return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16">
      {/* Панель фильтров и сортировки */}
      <div className="bg-card border-b shadow-sm sticky top-[53px] z-40">
        <div className="max-w-[1920px] mx-auto p-4 space-y-3">
          {/* Ряд 1: Формат ТК (ГМ / СМ), Город, Дата, Переключатель вида */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Переключатель ГМ / СМ */}
              <div className="inline-flex rounded-md border bg-muted/40 p-1">
                <button
                  onClick={() => setTkFormatFilter("ALL")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "ALL"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Все ТК (173)
                </button>
                <button
                  onClick={() => setTkFormatFilter("ГМ")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "ГМ"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  ГМ (94)
                </button>
                <button
                  onClick={() => setTkFormatFilter("СМ")}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "СМ"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  СМ (79)
                </button>
              </div>

              {/* Фильтр по городу */}
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-background font-medium"
              >
                <option value="">Все города ({CITIES.length})</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              {/* Выбор даты из календаря */}
              <div className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={allDates}
                      className="justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate
                        ? format(selectedDate, "dd.MM.yyyy", { locale: ru })
                        : "Выбрать дату"}
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

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-2">
                  <input
                    type="checkbox"
                    checked={allDates}
                    onChange={(e) => setAllDates(e.target.checked)}
                  />
                  Все даты
                </label>
              </div>

              {/* Поиск по номеру ТК или адресу */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск № ТК или адреса..."
                  value={searchTk}
                  onChange={(e) => setSearchTk(e.target.value)}
                  className="pl-8 h-8 w-[190px] text-xs"
                />
              </div>
            </div>

            {/* Переключение вида: Список ТК / Матрица */}
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border bg-muted/40 p-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "list"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Общий список ТК
                </button>
                <button
                  onClick={() => setViewMode("matrix")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "matrix"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Матрица (Кампании × ТК)
                </button>
              </div>

              <Button variant="ghost" size="sm" onClick={resetFilters} title="Сбросить все фильтры">
                <RotateCcw className="w-4 h-4 mr-1" />
                Сброс
              </Button>
            </div>
          </div>

          {/* Ряд 2: Фильтры и Сортировка по Типу, Формату, Заказчику */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Тип:</span>
                <select
                  value={campaignTypeFilter}
                  onChange={(e) => setCampaignTypeFilter(e.target.value)}
                  className="border rounded px-2 py-1 bg-background"
                >
                  <option value="">Все типы</option>
                  <option value="платный">платный</option>
                  <option value="не платный">не платный</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Формат РК:</span>
                <select
                  value={campaignFormatFilter}
                  onChange={(e) => setCampaignFormatFilter(e.target.value)}
                  className="border rounded px-2 py-1 bg-background"
                >
                  <option value="">Все форматы</option>
                  <option value="ГМ">ГМ</option>
                  <option value="СМ">СМ</option>
                  <option value="част.ГМ">част.ГМ</option>
                  <option value="част.СМ">част.СМ</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Заказчик:</span>
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="border rounded px-2 py-1 bg-background max-w-[180px]"
                >
                  <option value="">Все заказчики</option>
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
                className="h-7 w-[180px] text-xs"
              />

              <label className="flex items-center gap-1.5 cursor-pointer select-none text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyWithActiveAds}
                  onChange={(e) => setOnlyWithActiveAds(e.target.checked)}
                />
                Только ТК с роликами
              </label>
            </div>

            {/* Блок сортировки */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Сортировка кампаний:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border rounded px-2.5 py-1 bg-background font-medium"
              >
                <option value="client">По заказчику</option>
                <option value="type">По типу (платный / не платный)</option>
                <option value="format">По формату (ГМ / СМ / част.)</option>
                <option value="duration">По длительности (сек)</option>
                <option value="name">По названию ролика</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              >
                <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                {sortDir === "asc" ? "А → Я (По возр.)" : "Я → А (По убыв.)"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Сводная плашка показателей по текущей выборке */}
      <div className="max-w-[1920px] w-full mx-auto px-4 pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Показано ТК</div>
            <div className="text-xl font-bold mt-0.5">
              {stats.totalTk}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (ГМ: {stats.gmCount}, СМ: {stats.smCount})
              </span>
            </div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">ТК с активными роликами</div>
            <div className="text-xl font-bold mt-0.5">{stats.tkWithAds}</div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Активных кампаний</div>
            <div className="text-xl font-bold mt-0.5">{stats.activeCampaignsCount}</div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Средний хрон. на ТК</div>
            <div className="text-xl font-bold mt-0.5">{stats.avgSec} сек</div>
          </div>
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">ТК на реконструкции</div>
            <div className="text-xl font-bold text-red-600 mt-0.5">
              {filteredTkRows.filter((t) => t.reconstruction).length}
            </div>
          </div>
        </div>
      </div>

      {/* Основная область данных */}
      <div className="max-w-[1920px] w-full mx-auto px-4 mt-4 flex-1">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground bg-card border rounded-lg">
            Загрузка расписания...
          </div>
        ) : viewMode === "list" ? (
          /* ВИД 1: ОБЩИЙ СПИСОК ТК (173) */
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50 border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left w-[90px]">№ ТК</th>
                    <th className="p-3 text-left w-[90px]">Формат</th>
                    <th className="p-3 text-left w-[340px]">Адрес</th>
                    <th className="p-3 text-left w-[180px]">Город</th>
                    <th className="p-3 text-center w-[130px]">Хронометраж</th>
                    <th className="p-3 text-left">
                      Отображаемые рекламные кампании (отсортировано по:{" "}
                      {sortBy === "client"
                        ? "заказчику"
                        : sortBy === "type"
                        ? "типу"
                        : sortBy === "format"
                        ? "формату"
                        : sortBy === "duration"
                        ? "длительности"
                        : "названию"}
                      )
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTkRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Нет ТК по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {filteredTkRows.map((tk) => (
                    <tr
                      key={tk.number}
                      className="border-b hover:bg-muted/20 transition-colors align-top"
                    >
                      <td
                        className={cn(
                          "p-3 font-bold whitespace-nowrap",
                          tk.reconstruction && "bg-red-600 text-white"
                        )}
                        title={tk.reconstruction ? "ТК на реконструкции" : undefined}
                      >
                        {tk.number}
                        {tk.reconstruction && (
                          <span className="block text-[10px] font-normal opacity-90">
                            реконструкция
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={tk.format === "ГМ" ? "default" : "secondary"}>
                          {tk.format}
                        </Badge>
                      </td>
                      <td className="p-3 text-foreground/90">{tk.address}</td>
                      <td className="p-3 font-medium whitespace-nowrap">{tk.city}</td>
                      <td className="p-3 text-center">
                        <span
                          className={cn(
                            "inline-block px-2.5 py-1 rounded-full text-xs font-bold border",
                            getDurationBadgeClass(tk.totalDuration)
                          )}
                        >
                          {tk.totalDuration} сек
                        </span>
                      </td>
                      <td className="p-3">
                        {tk.activeCampaigns.length === 0 ? (
                          <span className="text-xs text-muted-foreground">— нет активных РК —</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {tk.activeCampaigns.map((camp) => (
                              <div
                                key={camp.id}
                                className="border rounded-md px-2.5 py-1.5 bg-background shadow-2xs text-xs flex flex-col gap-0.5"
                              >
                                <div className="flex items-center gap-1.5 font-semibold">
                                  <span>{camp.name}</span>
                                  <span className="text-[11px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-mono">
                                    {camp.duration}с
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                  <span>
                                    Заказчик: <strong className="text-foreground">{camp.client}</strong>
                                  </span>
                                  <span>•</span>
                                  <span>Формат: {camp._format}</span>
                                  <span>•</span>
                                  <span
                                    className={cn(
                                      "font-medium",
                                      camp._type === "платный"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-600 dark:text-amber-400"
                                    )}
                                  >
                                    {camp._type}
                                  </span>
                                </div>
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
          /* ВИД 2: МАТРИЦА (КАМПАНИИ × ТК) */
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[75vh]">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead className="bg-muted/60 sticky top-0 z-20">
                  <tr>
                    <th className="p-3 text-left border-b border-r sticky left-0 z-30 bg-muted min-w-[300px]">
                      Рекламная кампания / Заказчик / Тип / Формат
                    </th>
                    {filteredTkRows.map((tk) => (
                      <th
                        key={tk.number}
                        className={cn(
                          "p-2 border-b border-r text-center min-w-[78px] max-w-[90px]",
                          tk.reconstruction && "bg-red-600/20"
                        )}
                        title={`${tk.city}, ${tk.address}`}
                      >
                        <div className="font-bold">№{tk.number}</div>
                        <div className="text-[10px] text-muted-foreground">{tk.format}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{tk.city}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedCampaigns.length === 0 && (
                    <tr>
                      <td
                        colSpan={filteredTkRows.length + 1}
                        className="p-8 text-center text-muted-foreground"
                      >
                        Нет рекламных кампаний по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {filteredAndSortedCampaigns.map((camp) => (
                    <tr key={camp.id} className="border-b hover:bg-muted/20">
                      <td className="p-2.5 border-r sticky left-0 z-10 bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        <div className="font-semibold text-sm">{camp.name}</div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-foreground">{camp.client}</span>
                          <span>•</span>
                          <span>{camp.duration} сек</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded bg-muted">{camp._format}</span>
                          <span>•</span>
                          <span
                            className={cn(
                              "font-medium",
                              camp._type === "платный"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {camp._type}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {camp.startDate} — {camp.endDate}
                        </div>
                      </td>
                      {filteredTkRows.map((tk) => {
                        const isPlaced = camp._scNumbersSet.has(tk.number)
                        return (
                          <td key={tk.number} className="border-r p-1 text-center">
                            {isPlaced ? (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold text-[11px]">
                                {camp.duration}с
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {/* Итоговая строка хронометража по каждому ТК */}
                  <tr className="bg-muted/30 font-bold border-t-2">
                    <td className="p-3 border-r sticky left-0 z-10 bg-muted">
                      Итого хронометраж (сек)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td key={tk.number} className="p-2 border-r text-center">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs border",
                            getDurationBadgeClass(tk.totalDuration)
                          )}
                        >
                          {tk.totalDuration}с
                        </span>
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
