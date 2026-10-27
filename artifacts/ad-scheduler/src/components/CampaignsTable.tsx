import React, { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, addDays, subDays, startOfMonth, endOfMonth } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  Download,
  Copy,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  BookmarkCheck,
  ArrowRightCircle,
  Trash2,
} from "lucide-react"
import EditCampaignDialog from "./EditCampaignDialog"
import { getApiUrl } from "@/lib/api"
import { FORMAT_OPTIONS, CampaignInitialData } from "./AddCampaignDialog"
import { MASTER_TK_LIST } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { BookingRow } from "@/pages/RebuildAdmin"

type Campaign = {
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

type StatusLabel = "опубликовано" | "запланировано" | "завершён"

const GM_NUMBERS_SET = new Set(
  MASTER_TK_LIST.filter((t) => t.format === "ГМ").map((t) => t.number)
)
const SM_NUMBERS_SET = new Set(
  MASTER_TK_LIST.filter((t) => t.format === "СМ").map((t) => t.number)
)

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Ошибка сервера (${res.status})`)
  }
  return res.json()
}

async function fetchBookings(): Promise<BookingRow[]> {
  const res = await fetch(getApiUrl("/api/bookings"))
  if (!res.ok) return []
  return res.json()
}

interface CampaignsTableProps {
  onDuplicate?: (data: CampaignInitialData) => void
}

export function CampaignsTable({ onDuplicate }: CampaignsTableProps) {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, isError, error, refetch } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  const { data: bookings = [] } = useQuery<BookingRow[]>({
    queryKey: ["bookings"],
    queryFn: fetchBookings,
  })

  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [editingId, setEditingId] = useState<number | null>(null)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [periodStart, setPeriodStart] = useState<Date>(() => startOfMonth(new Date()))
  const [periodEnd, setPeriodEnd] = useState<Date>(() => endOfMonth(new Date()))

  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterType, setFilterType] = useState<string>("")
  const [filterClient, setFilterClient] = useState<string>("")
  const [filterFormat, setFilterFormat] = useState<string>("")
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState<boolean>(false)

  const dateIso = format(selectedDate, "yyyy-MM-dd")
  const in3DaysIso = format(addDays(selectedDate, 3), "yyyy-MM-dd")
  const periodStartIso = format(periodStart, "yyyy-MM-dd")
  const periodEndIso = format(periodEnd, "yyyy-MM-dd")

  const toggle = (id: number) => setSelected((s) => ({ ...s, [id]: !s[id] }))
  const selectAll = () => {
    const all: Record<number, boolean> = {}
    rows.forEach((r) => (all[r.id] = true))
    setSelected(all)
  }
  const clearAll = () => setSelected({})

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => Number(k))

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить кампанию? Это действие необратимо.")) return
    try {
      const res = await fetch(getApiUrl(`/api/campaigns/${id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Удаление не удалось")
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Удалить выбранные кампании (${selectedIds.length} шт.)?`)) return
    try {
      const res = await fetch(getApiUrl("/api/campaigns/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) throw new Error("Ошибка массового удаления")
      clearAll()
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  const handleDeleteBooking = async (id: number) => {
    if (!window.confirm("Удалить эту бронь из очереди?")) return
    try {
      await fetch(getApiUrl(`/api/bookings/${id}`), { method: "DELETE" })
      queryClient.invalidateQueries({ queryKey: ["bookings"] })
    } catch (err) {
      window.alert(String(err))
    }
  }

  const clients = Array.from(new Set(rows.map((r) => r.client))).filter(Boolean)

  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const isPaid =
        r.status === "Платник" ||
        r.status === "платный" ||
        (r.note && r.note.toLowerCase().includes("платн") && !r.note.toLowerCase().includes("не "))
      const typeLabel = isPaid ? "платный" : "не платный"
      const formatLabel =
        r.tkType ||
        (r as any).tk_type ||
        Array.from(new Set((r.shoppingCenters || []).map((s) => s.format))).join(", ") ||
        "ГМ"
      const scNums = (r.shoppingCenters || []).map((s) => String(s.number).trim())
      const tkListStr = scNums.join(", ")

      const hasGmTk = scNums.some((n) => GM_NUMBERS_SET.has(n))
      const hasSmTk = scNums.some((n) => SM_NUMBERS_SET.has(n))
      const isGm =
        formatLabel === "ГМ" ||
        formatLabel === "част.ГМ" ||
        formatLabel === "ГМ+СМ" ||
        hasGmTk
      const isSm =
        formatLabel === "СМ" ||
        formatLabel === "част.СМ" ||
        formatLabel === "ГМ+СМ" ||
        hasSmTk

      let computedStatus: StatusLabel = "опубликовано"
      if (r.startDate > dateIso) {
        computedStatus = "запланировано"
      } else if (r.endDate < dateIso) {
        computedStatus = "завершён"
      }

      const isExpiringSoon =
        computedStatus === "опубликовано" && r.endDate >= dateIso && r.endDate <= in3DaysIso

      return {
        ...r,
        _isPaid: Boolean(isPaid),
        _typeLabel: typeLabel,
        _formatLabel: formatLabel,
        _tkListStr: tkListStr,
        _isGm: isGm,
        _isSm: isSm,
        _statusLabel: computedStatus,
        _isExpiringSoon: isExpiringSoon,
      }
    })
  }, [rows, dateIso, in3DaysIso])

  const periodPublishedStats = useMemo(() => {
    const start = periodStartIso <= periodEndIso ? periodStartIso : periodEndIso
    const end = periodStartIso <= periodEndIso ? periodEndIso : periodStartIso

    const publishedInPeriod = normalizedRows.filter((r) => {
      if (filterClient && r.client !== filterClient) return false
      if (filterType && r._typeLabel !== filterType) return false
      return r.startDate <= end && r.endDate >= start
    })

    return {
      totalCount: publishedInPeriod.length,
      gmCount: publishedInPeriod.filter((r) => r._isGm).length,
      smCount: publishedInPeriod.filter((r) => r._isSm).length,
    }
  }, [normalizedRows, periodStartIso, periodEndIso, filterClient, filterType])

  const filteredRows = normalizedRows
    .filter((r) => (filterStatus ? r._statusLabel === filterStatus : true))
    .filter((r) => (filterType ? r._typeLabel === filterType : true))
    .filter((r) => (filterClient ? r.client === filterClient : true))
    .filter((r) => (filterFormat ? r._formatLabel === filterFormat : true))
    .filter((r) => (onlyExpiringSoon ? r._isExpiringSoon : true))

  const handleExportCsv = () => {
    const headers = [
      "№",
      "Название",
      "Статус",
      "Дата старта",
      "Дата окончания",
      "Заказчик",
      "Длительность (сек)",
      "Формат",
      "Тип",
      "Список ТК",
    ]
    const csvRows = filteredRows.map((r, idx) => [
      idx + 1,
      `"${(r.name || "").replace(/"/g, '""')}"`,
      r._statusLabel,
      r.startDate,
      r.endDate,
      `"${(r.client || "").replace(/"/g, '""')}"`,
      r.duration,
      r._formatLabel,
      r._typeLabel,
      `"${(r._tkListStr || "").replace(/"/g, '""')}"`,
    ])
    const content = "\uFEFF" + [headers.join(";"), ...csvRows.map((row) => row.join(";"))].join("\r\n")
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `кампании_${dateIso}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderStatusBadge = (status: StatusLabel, isExpiringSoon: boolean) => {
    if (status === "опубликовано") {
      return (
        <div className="flex items-center gap-1">
          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            опубликовано
          </span>
          {isExpiringSoon && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              истекает ≤3 дн.
            </span>
          )}
        </div>
      )
    }
    if (status === "запланировано") {
      return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
          запланировано
        </span>
      )
    }
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
        завершён
      </span>
    )
  }

  return (
    <div className="overflow-auto bg-card rounded-lg border shadow-sm p-4 space-y-4">
      <EditCampaignDialog
        campaignId={editingId}
        open={!!editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null)
        }}
      />

      {/* Блок подсчета опубликованных роликов и РК за выбранный период (только для Админа) */}
      <div className="bg-muted/20 border rounded-md px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold flex items-center gap-1.5 text-foreground">
            <BarChart3 className="w-4 h-4 text-primary" />
            Опубликовано за период:
          </span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-medium bg-background">
                <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground" />
                С: {format(periodStart, "dd.MM.yyyy", { locale: ru })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={periodStart}
                onSelect={(d) => d && setPeriodStart(d)}
                locale={ru}
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">—</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-medium bg-background">
                <CalendarIcon className="mr-1.5 h-3 w-3 text-muted-foreground" />
                По: {format(periodEnd, "dd.MM.yyyy", { locale: ru })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={periodEnd}
                onSelect={(d) => d && setPeriodEnd(d)}
                locale={ru}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setPeriodStart(startOfMonth(selectedDate))
              setPeriodEnd(endOfMonth(selectedDate))
            }}
          >
            Текущий месяц
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1 rounded border bg-background">
            Всего роликов (РК):{" "}
            <strong className="text-sm font-bold text-foreground">
              {periodPublishedStats.totalCount}
            </strong>
          </div>

          <div className="px-3 py-1 rounded border bg-primary/10 border-primary/30 text-primary">
            Для ГМ:{" "}
            <strong className="text-sm font-bold">{periodPublishedStats.gmCount}</strong> рол. (РК)
          </div>

          <div className="px-3 py-1 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
            Для СМ:{" "}
            <strong className="text-sm font-bold">{periodPublishedStats.smCount}</strong> рол. (РК)
          </div>
        </div>
      </div>

      {/* Быстрый блок очереди бронирования от коллег (если есть активные брони) */}
      {bookings.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 space-y-2">
          <div className="text-xs font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <BookmarkCheck className="w-4 h-4" />
            Очередь бронирования от коллег ({bookings.length}):
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse bg-background rounded border">
              <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Очередь</th>
                  <th className="p-2 text-left">Фамилия</th>
                  <th className="p-2 text-left">Даты показа</th>
                  <th className="p-2 text-left">Формат</th>
                  <th className="p-2 text-left">Тип</th>
                  <th className="p-2 text-left">Хрон.</th>
                  <th className="p-2 text-left">Список ТК</th>
                  <th className="p-2 text-left">Действия</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b, idx) => {
                  const isPaid =
                    b.payerType.toLowerCase().includes("плат") &&
                    !b.payerType.toLowerCase().includes("бес")
                  return (
                    <tr key={b.id} className="border-b hover:bg-muted/20">
                      <td className="p-2 font-bold text-amber-700 dark:text-amber-400">№{idx + 1}</td>
                      <td className="p-2 font-semibold">{b.surname}</td>
                      <td className="p-2">{b.startDate} — {b.endDate}</td>
                      <td className="p-2">{b.format}</td>
                      <td className="p-2">{b.payerType}</td>
                      <td className="p-2 font-mono font-bold">{b.duration} сек</td>
                      <td className="p-2 max-w-[240px] truncate" title={b.tkNumbersRaw}>
                        {b.shoppingCenterNumbers.length} ТК ({b.tkNumbersRaw})
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {onDuplicate && (
                            <button
                              type="button"
                              onClick={() =>
                                onDuplicate({
                                  name: `Бронь: ${b.surname}`,
                                  startDate: b.startDate,
                                  endDate: b.endDate,
                                  client: b.surname,
                                  duration: b.duration,
                                  format: b.format,
                                  type: isPaid ? "Платник" : "Не платник",
                                  shoppingCenterNumbers: b.tkNumbersRaw,
                                })
                              }
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              В эфир (Создать РК)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteBooking(b.id)}
                            className="inline-flex items-center gap-0.5 text-xs text-red-600 hover:underline"
                          >
                            <Trash2 className="w-3 h-3" />
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Фильтры реестра кампаний */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Дата проверки статуса</label>
            <div className="inline-flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSelectedDate((d) => subDays(d, 1))}
                title="Предыдущий день"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs font-medium">
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    {format(selectedDate, "dd.MM.yyyy", { locale: ru })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    locale={ru}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                title="Следующий день"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Статус РК</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded px-2.5 py-1 text-sm bg-background h-8"
            >
              <option value="">Все статусы</option>
              <option value="опубликовано">опубликовано</option>
              <option value="запланировано">запланировано</option>
              <option value="завершён">завершён</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Заказчик</label>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="border rounded px-2.5 py-1 text-sm bg-background h-8"
            >
              <option value="">Все заказчики</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Формат</label>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className="border rounded px-2.5 py-1 text-sm bg-background h-8"
            >
              <option value="">Все форматы</option>
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Тип</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border rounded px-2.5 py-1 text-sm bg-background h-8"
            >
              <option value="">Все типы</option>
              <option value="платный">платный</option>
              <option value="не платный">не платный</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none h-8 px-2 border rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
            <input
              type="checkbox"
              checked={onlyExpiringSoon}
              onChange={(e) => setOnlyExpiringSoon(e.target.checked)}
            />
            Истекают ≤ 3 дн. ({normalizedRows.filter((r) => r._isExpiringSoon).length})
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExportCsv}>
            <Download className="w-3.5 h-3.5" />
            Скачать Excel
          </Button>
          <span className="text-sm text-muted-foreground">Выбрано: {selectedIds.length}</span>
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              Удалить выбранные
            </Button>
          )}
          <button className="text-sm underline" onClick={selectAll}>
            Выбрать всё
          </button>
          <button className="text-sm underline" onClick={clearAll}>
            Сбросить
          </button>
        </div>
      </div>

      {isError && (
        <div className="p-3 rounded border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>Ошибка загрузки кампаний: {(error as Error)?.message || "Сервер недоступен"}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      )}

      <table className="w-full table-auto text-sm border-collapse">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-left w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedIds.length === rows.length}
                onChange={(e) => (e.target.checked ? selectAll() : clearAll())}
              />
            </th>
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">Название</th>
            <th className="p-2 text-left">Статус</th>
            <th className="p-2 text-left">Дата старта</th>
            <th className="p-2 text-left">Дата окончания</th>
            <th className="p-2 text-left">Заказчик</th>
            <th className="p-2 text-left">Длительность</th>
            <th className="p-2 text-left">Формат</th>
            <th className="p-2 text-left">Тип</th>
            <th className="p-2 text-left">Список ТК</th>
            <th className="p-2 text-left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={12} className="p-6 text-center text-muted-foreground">
                Загрузка данных...
              </td>
            </tr>
          )}
          {!isLoading && filteredRows.length === 0 && (
            <tr>
              <td colSpan={12} className="p-6 text-center text-muted-foreground">
                Нет рекламных кампаний
              </td>
            </tr>
          )}
          {filteredRows.map((r, idx) => (
            <tr key={r.id} className="border-t hover:bg-muted/20">
              <td className="p-2">
                <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} />
              </td>
              <td className="p-2 text-muted-foreground">{idx + 1}</td>
              <td className="p-2 font-medium">{r.name}</td>
              <td className="p-2">{renderStatusBadge(r._statusLabel, r._isExpiringSoon)}</td>
              <td className="p-2">{r.startDate}</td>
              <td className="p-2">{r.endDate}</td>
              <td className="p-2">{r.client}</td>
              <td className="p-2 font-mono">{r.duration} сек</td>
              <td className="p-2">{r._formatLabel}</td>
              <td className="p-2">{r._typeLabel}</td>
              <td className="p-2 max-w-[220px] truncate" title={r._tkListStr}>
                {r._tkListStr || "—"}
              </td>
              <td className="p-2">
                <div className="flex gap-2.5 items-center">
                  <button
                    className="text-xs text-blue-600 hover:underline font-medium"
                    onClick={() => setEditingId(r.id)}
                  >
                    Редактировать
                  </button>
                  {onDuplicate && (
                    <button
                      className="text-xs text-emerald-600 hover:underline font-medium flex items-center gap-0.5"
                      onClick={() =>
                        onDuplicate({
                          name: `${r.name} (копия)`,
                          startDate: r.startDate,
                          endDate: r.endDate,
                          client: r.client,
                          duration: r.duration,
                          format: r._formatLabel === "—" ? "ГМ" : r._formatLabel,
                          type: r._isPaid ? "Платник" : "Не платник",
                          shoppingCenterNumbers: r._tkListStr,
                        })
                      }
                      title="Создать копию этой кампании"
                    >
                      <Copy className="w-3 h-3" /> Копировать
                    </button>
                  )}
                  <button
                    className="text-xs text-red-600 hover:underline font-medium"
                    onClick={() => handleDelete(r.id)}
                  >
                    Удалить
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CampaignsTable
