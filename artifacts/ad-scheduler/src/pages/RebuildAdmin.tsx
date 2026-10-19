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

function formatShortDate(iso: string) {
  if (!iso) return ""
  const parts = iso.split("-")
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}`
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
  const [onlyWithAds, setOnlyWithAds] = useState<boolean>(false)

  // Календарь и режим показа по дате:
  // "active_and_planned" — идущие в этот день + запланированные
  // "active" — только транслирующиеся в выбранный день
  // "planned" — только запланированные (старт после выбранного дня)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [datePhaseFilter, setDatePhaseFilter] = useState<"active_and_planned" | "active" | "planned">("active_and_planned")

  // Фильтры по параметрам кампаний
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>("")
  const [campaignFormatFilter, setCampaignFormatFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // Сортировка кампаний (по типу, формату, заказчику, длительности)
  const [sortBy, setSortBy] = useState<"client" | "format" | "type" | "duration" | "name">("client")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const dateIso = format(selectedDate, "yyyy-MM-dd")

  // Обогащаем кампании вычисляемыми полями Тип, Формат и Статус относительно выбранной даты
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

      let phaseOnDate: "active" | "planned" | "finished" = "active"
      if (c.startDate > dateIso) {
        phaseOnDate = "planned"
      } else if (c.endDate < dateIso) {
        phaseOnDate = "finished"
      }

      return {
        ...c,
        _type: typeLabel,
        _format: formatLabel,
        _scNumbersSet: scNumbersSet,
        _phase: phaseOnDate,
      }
    })
  }, [rawCampaigns, dateIso])

  const allClients = useMemo(
    () => Array.from(new Set(enrichedCampaigns.map((c) => c.client))).filter(Boolean).sort(),
    [enrichedCampaigns]
  )

  // Фильтрация по заказчику/типу/формату/поиску и сортировка
  const baseFilteredCampaigns = useMemo(() => {
    const list = enrichedCampaigns.filter((c) => {
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
    campaignTypeFilter,
    campaignFormatFilter,
    clientFilter,
    searchQuery,
    sortBy,
    sortDir,
  ])

  // Разделяем на транслирующиеся в выбранный день и запланированные
  const activeOnDateCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._phase === "active"),
    [baseFilteredCampaigns]
  )

  const plannedOnDateCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._phase === "planned"),
    [baseFilteredCampaigns]
  )

  // Кампании для отображения согласно переключателю фазы
  const displayedCampaigns = useMemo(() => {
    if (datePhaseFilter === "active") return activeOnDateCampaigns
    if (datePhaseFilter === "planned") return plannedOnDateCampaigns
    return [...activeOnDateCampaigns, ...plannedOnDateCampaigns]
  }, [datePhaseFilter, activeOnDateCampaigns, plannedOnDateCampaigns])

  // Строим список ТК с подсчетом активных и запланированных роликов на выбранную дату
  const filteredTkRows = useMemo(() => {
    return MASTER_TK_LIST.map((tk) => {
      const activeList = activeOnDateCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const plannedList = plannedOnDateCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const shownList = displayedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))

      const activeDuration = activeList.reduce((sum, c) => sum + (c.duration || 0), 0)
      const plannedDuration = plannedList.reduce((sum, c) => sum + (c.duration || 0), 0)

      return {
        ...tk,
        activeList,
        plannedList,
        shownList,
        activeDuration,
        plannedDuration,
      }
    }).filter((tk) => {
      if (tkFormatFilter !== "ALL" && tk.format !== tkFormatFilter) return false
      if (cityFilter && tk.city !== cityFilter) return false
      if (onlyWithAds && tk.shownList.length === 0) return false
      if (searchTk.trim()) {
        const q = searchTk.trim().toLowerCase()
        const matchNum = tk.number.toLowerCase().includes(q)
        const matchAddr = tk.address.toLowerCase().includes(q)
        const matchCity = tk.city.toLowerCase().includes(q)
        if (!matchNum && !matchAddr && !matchCity) return false
      }
      return true
    })
  }, [
    tkFormatFilter,
    cityFilter,
    onlyWithAds,
    searchTk,
    activeOnDateCampaigns,
    plannedOnDateCampaigns,
    displayedCampaigns,
  ])

  // Сводная статистика на выбранную дату с учетом фильтров ТК
  const stats = useMemo(() => {
    const visibleTkNums = new Set(filteredTkRows.map((t) => t.number))

    const activeInVisibleTk = activeOnDateCampaigns.filter((c) =>
      Array.from(c._scNumbersSet).some((num) => visibleTkNums.has(num))
    )
    const plannedInVisibleTk = plannedOnDateCampaigns.filter((c) =>
      Array.from(c._scNumbersSet).some((num) => visibleTkNums.has(num))
    )

    const totalTk = filteredTkRows.length
    const gmCount = filteredTkRows.filter((t) => t.format === "ГМ").length
    const smCount = filteredTkRows.filter((t) => t.format === "СМ").length
    const tkBroadcastingCount = filteredTkRows.filter((t) => t.activeList.length > 0).length
    const tkPlannedCount = filteredTkRows.filter((t) => t.plannedList.length > 0).length
    const totalActiveSec = filteredTkRows.reduce((s, t) => s + t.activeDuration, 0)
    const avgSec = totalTk > 0 ? Math.round(totalActiveSec / totalTk) : 0

    return {
      totalTk,
      gmCount,
      smCount,
      tkBroadcastingCount,
      tkPlannedCount,
      activeCount: activeInVisibleTk.length,
      plannedCount: plannedInVisibleTk.length,
      avgSec,
    }
  }, [filteredTkRows, activeOnDateCampaigns, plannedOnDateCampaigns])

  const resetFilters = () => {
    setTkFormatFilter("ALL")
    setCityFilter("")
    setSearchTk("")
    setOnlyWithAds(false)
    setSelectedDate(new Date())
    setDatePhaseFilter("active_and_planned")
    setCampaignTypeFilter("")
    setCampaignFormatFilter("")
    setClientFilter("")
    setSearchQuery("")
    setSortBy("client")
    setSortDir("asc")
  }

  const getDurationBadgeClass = (sec: number) => {
    if (sec === 0) return "bg-muted text-muted-foreground border-transparent"
    if (sec > DURATION_THRESHOLDS.ORANGE_MAX) return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
    if (sec > DURATION_THRESHOLDS.YELLOW_MAX) return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"
    if (sec > DURATION_THRESHOLDS.GREEN_MAX) return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-10">
      {/* Компактная панель фильтров и сортировки */}
      <div className="bg-card border-b shadow-2xs sticky top-[53px] z-40">
        <div className="max-w-[1920px] mx-auto px-3 py-2 space-y-2">
          {/* Ряд 1: Формат ТК (ГМ / СМ), Город, Календарь даты, Фильтр эфира/плана */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Переключатель ГМ / СМ */}
              <div className="inline-flex rounded border bg-muted/40 p-0.5">
                <button
                  onClick={() => setTkFormatFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "ALL"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Все (173)
                </button>
                <button
                  onClick={() => setTkFormatFilter("ГМ")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "ГМ"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  ГМ (94)
                </button>
                <button
                  onClick={() => setTkFormatFilter("СМ")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                    tkFormatFilter === "СМ"
                      ? "bg-primary text-primary-foreground"
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
                className="border rounded px-2.5 py-1 text-xs bg-background font-medium h-7"
              >
                <option value="">Все города ({CITIES.length})</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              {/* Выбор даты из календаря */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs justify-start text-left font-medium"
                  >
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    Дата: {format(selectedDate, "dd.MM.yyyy", { locale: ru })}
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

              {/* Переключатель: В эфире на дату / Запланировано */}
              <div className="inline-flex rounded border bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setDatePhaseFilter("active_and_planned")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    datePhaseFilter === "active_and_planned"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  В эфире + План ({stats.activeCount + stats.plannedCount})
                </button>
                <button
                  onClick={() => setDatePhaseFilter("active")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    datePhaseFilter === "active"
                      ? "bg-emerald-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Транслируются ({stats.activeCount})
                </button>
                <button
                  onClick={() => setDatePhaseFilter("planned")}
                  className={cn(
                    "px-2 py-0.5 rounded font-medium transition-colors",
                    datePhaseFilter === "planned"
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Запланировано ({stats.plannedCount})
                </button>
              </div>

              {/* Поиск по номеру ТК или адресу */}
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="№ ТК или адрес..."
                  value={searchTk}
                  onChange={(e) => setSearchTk(e.target.value)}
                  className="pl-6 h-7 w-[150px] text-xs"
                />
              </div>
            </div>

            {/* Переключение вида: Список ТК / Матрица */}
            <div className="flex items-center gap-1.5">
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

              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={resetFilters}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Сброс
              </Button>
            </div>
          </div>

          {/* Ряд 2: Фильтры и Сортировка по Типу, Формату, Заказчику */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t text-xs">
            <div className="flex flex-wrap items-center gap-2">
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
                className="h-6 w-[160px] text-xs px-2"
              />

              <label className="flex items-center gap-1 cursor-pointer select-none text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyWithAds}
                  onChange={(e) => setOnlyWithAds(e.target.checked)}
                />
                Только ТК с роликами
              </label>
            </div>

            {/* Сортировка */}
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

      {/* Компактная сводка на выбранную дату */}
      <div className="max-w-[1920px] w-full mx-auto px-3 pt-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="bg-card border rounded px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Показано ТК</div>
            <div className="text-base font-bold">
              {stats.totalTk}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (ГМ: {stats.gmCount}, СМ: {stats.smCount})
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              Транслируется на {format(selectedDate, "dd.MM.yyyy")}
            </div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {stats.activeCount} рол.{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (в {stats.tkBroadcastingCount} ТК)
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              Запланировано (после {format(selectedDate, "dd.MM")})
            </div>
            <div className="text-base font-bold text-blue-600 dark:text-blue-400">
              {stats.plannedCount} рол.{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (в {stats.tkPlannedCount} ТК)
              </span>
            </div>
          </div>

          <div className="bg-card border rounded px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Средний хрон. в эфире</div>
            <div className="text-base font-bold">{stats.avgSec} сек</div>
          </div>

          <div className="bg-card border rounded px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Выбранная дата</div>
            <div className="text-base font-bold">
              {format(selectedDate, "d MMMM yyyy", { locale: ru })}
            </div>
          </div>
        </div>
      </div>

      {/* Основная таблица с уменьшенными отступами и расстояниями между столбцами */}
      <div className="max-w-[1920px] w-full mx-auto px-3 mt-2.5 flex-1">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground bg-card border rounded text-xs">
            Загрузка расписания...
          </div>
        ) : viewMode === "list" ? (
          /* ВИД 1: КОМПАКТНЫЙ ОБЩИЙ СПИСОК ТК */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r w-[52px]">№ ТК</th>
                    <th className="px-2 py-1.5 text-center border-r w-[54px]">Форм.</th>
                    <th className="px-2 py-1.5 text-left border-r w-[135px]">Город</th>
                    <th className="px-2 py-1.5 text-left border-r w-[250px]">Адрес</th>
                    <th className="px-2 py-1.5 text-center border-r w-[105px]">
                      В эфире ({format(selectedDate, "dd.MM")})
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[85px]">План</th>
                    <th className="px-2 py-1.5 text-left">
                      Ролики (транслируемые и запланированные)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTkRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        Нет ТК по выбранным фильтрам
                      </td>
                    </tr>
                  )}
                  {filteredTkRows.map((tk) => (
                    <tr
                      key={tk.number}
                      className="border-b hover:bg-muted/20 transition-colors align-middle"
                    >
                      <td className="px-2 py-1 font-bold border-r whitespace-nowrap">
                        {tk.number}
                      </td>
                      <td className="px-1.5 py-1 text-center border-r">
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold",
                            tk.format === "ГМ"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-foreground"
                          )}
                        >
                          {tk.format}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-medium border-r whitespace-nowrap">
                        {tk.city}
                      </td>
                      <td className="px-2 py-1 text-foreground/90 border-r truncate max-w-[250px]" title={tk.address}>
                        {tk.address}
                      </td>
                      <td className="px-2 py-1 text-center border-r whitespace-nowrap">
                        {tk.activeList.length > 0 ? (
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold border",
                              getDurationBadgeClass(tk.activeDuration)
                            )}
                          >
                            {tk.activeList.length} рол. • {tk.activeDuration}с
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-center border-r whitespace-nowrap">
                        {tk.plannedList.length > 0 ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400">
                            {tk.plannedList.length} рол. ({tk.plannedDuration}с)
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {tk.shownList.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tk.shownList.map((camp) => {
                              const isPlanned = camp._phase === "planned"
                              return (
                                <div
                                  key={camp.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px]",
                                    isPlanned
                                      ? "bg-blue-500/10 border-blue-500/30"
                                      : "bg-background border-border"
                                  )}
                                  title={`${camp.name} | Заказчик: ${camp.client} | Формат: ${camp._format} | Тип: ${camp._type} | Период: ${camp.startDate} — ${camp.endDate}`}
                                >
                                  <span
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full shrink-0",
                                      isPlanned ? "bg-blue-500" : "bg-emerald-500"
                                    )}
                                  />
                                  <span className="font-semibold">{camp.name}</span>
                                  <span className="text-muted-foreground">({camp.client})</span>
                                  <span className="font-mono font-semibold text-primary">
                                    {camp.duration}с
                                  </span>
                                  <span className="text-[10px] px-1 rounded bg-muted">
                                    {camp._format}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[10px]",
                                      camp._type === "платный"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-amber-600 dark:text-amber-400"
                                    )}
                                  >
                                    {camp._type}
                                  </span>
                                  {isPlanned && (
                                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                      [с {formatShortDate(camp.startDate)}]
                                    </span>
                                  )}
                                </div>
                              )
                            })}
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
          /* ВИД 2: КОМПАКТНАЯ МАТРИЦА (КАМПАНИИ × ТК) */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-auto max-h-[78vh]">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead className="bg-muted/60 sticky top-0 z-20">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-b border-r sticky left-0 z-30 bg-muted min-w-[260px]">
                      Кампания / Заказчик / Статус на {format(selectedDate, "dd.MM")}
                    </th>
                    {filteredTkRows.map((tk) => (
                      <th
                        key={tk.number}
                        className="px-1 py-1 border-b border-r text-center min-w-[52px] max-w-[64px]"
                        title={`${tk.city}, ${tk.address}`}
                      >
                        <div className="font-bold text-[11px]">№{tk.number}</div>
                        <div className="text-[9px] text-muted-foreground">{tk.format}</div>
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
                  {displayedCampaigns.map((camp) => {
                    const isPlanned = camp._phase === "planned"
                    return (
                      <tr key={camp.id} className="border-b hover:bg-muted/20">
                        <td className="px-2 py-1 border-r sticky left-0 z-10 bg-card">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs truncate">{camp.name}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.2 rounded font-medium shrink-0",
                                isPlanned
                                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              )}
                            >
                              {isPlanned
                                ? `План с ${formatShortDate(camp.startDate)}`
                                : "В эфире"}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span className="font-medium text-foreground">{camp.client}</span>
                            <span>•</span>
                            <span>{camp.duration}с</span>
                            <span>•</span>
                            <span>{camp._format}</span>
                            <span>•</span>
                            <span>{camp._type}</span>
                          </div>
                        </td>
                        {filteredTkRows.map((tk) => {
                          const isPlaced = camp._scNumbersSet.has(tk.number)
                          return (
                            <td key={tk.number} className="border-r px-0.5 py-1 text-center">
                              {isPlaced ? (
                                <span
                                  className={cn(
                                    "inline-block px-1 py-0.2 rounded font-bold text-[10px]",
                                    isPlanned
                                      ? "bg-blue-600/20 text-blue-700 dark:text-blue-300"
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
                    )
                  })}
                  {/* Итоговая строка по эфиру на выбранную дату */}
                  <tr className="bg-muted/30 font-bold border-t-2">
                    <td className="px-2 py-1.5 border-r sticky left-0 z-10 bg-muted text-[11px]">
                      В эфире на {format(selectedDate, "dd.MM.yyyy")} (сек)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td key={tk.number} className="px-1 py-1 border-r text-center">
                        <span
                          className={cn(
                            "inline-block px-1 py-0.2 rounded text-[10px] border",
                            getDurationBadgeClass(tk.activeDuration)
                          )}
                        >
                          {tk.activeDuration}с
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
