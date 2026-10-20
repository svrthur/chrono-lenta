import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import EditCampaignDialog from "./EditCampaignDialog"
import { getApiUrl } from "@/lib/api"
import { FORMAT_OPTIONS } from "./AddCampaignDialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

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

async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Ошибка сервера (${res.status})`)
  }
  return res.json()
}

export function CampaignsTable() {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, isError, error, refetch } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [editingId, setEditingId] = useState<number | null>(null)

  // Дата для расчета статуса РК
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterType, setFilterType] = useState<string>("")
  const [filterClient, setFilterClient] = useState<string>("")
  const [filterFormat, setFilterFormat] = useState<string>("")

  const dateIso = format(selectedDate, "yyyy-MM-dd")

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

  const clients = Array.from(new Set(rows.map((r) => r.client))).filter(Boolean)

  const normalizedRows = rows.map((r) => {
    const isPaid =
      r.status === "Платник" ||
      r.status === "платный" ||
      (r.note && r.note.toLowerCase().includes("платн") && !r.note.toLowerCase().includes("не "))
    const typeLabel = isPaid ? "платный" : "не платный"
    const formatLabel =
      r.tkType ||
      (r as any).tk_type ||
      Array.from(new Set((r.shoppingCenters || []).map((s) => s.format))).join(", ") ||
      "—"
    const tkListStr = (r.shoppingCenters || []).map((s) => s.number).join(", ")

    let computedStatus: StatusLabel = "опубликовано"
    if (r.startDate > dateIso) {
      computedStatus = "запланировано"
    } else if (r.endDate < dateIso) {
      computedStatus = "завершён"
    }

    return {
      ...r,
      _typeLabel: typeLabel,
      _formatLabel: formatLabel,
      _tkListStr: tkListStr,
      _statusLabel: computedStatus,
    }
  })

  const filteredRows = normalizedRows
    .filter((r) => (filterStatus ? r._statusLabel === filterStatus : true))
    .filter((r) => (filterType ? r._typeLabel === filterType : true))
    .filter((r) => (filterClient ? r.client === filterClient : true))
    .filter((r) => (filterFormat ? r._formatLabel === filterFormat : true))

  const renderStatusBadge = (status: StatusLabel) => {
    if (status === "опубликовано") {
      return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          опубликовано
        </span>
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
    <div className="overflow-auto bg-card rounded-lg border shadow-sm p-4">
      <EditCampaignDialog
        campaignId={editingId}
        open={!!editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null)
        }}
      />

      {/* Меню фильтров таблицы и календарь перерасчета */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Дата проверки</label>
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
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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
        </div>

        <div className="flex items-center gap-3">
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
        <div className="mb-4 p-3 rounded border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
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
              <td className="p-2">{renderStatusBadge(r._statusLabel)}</td>
              <td className="p-2">{r.startDate}</td>
              <td className="p-2">{r.endDate}</td>
              <td className="p-2">{r.client}</td>
              <td className="p-2 font-mono">{r.duration} сек</td>
              <td className="p-2">{r._formatLabel}</td>
              <td className="p-2">{r._typeLabel}</td>
              <td className="p-2 max-w-[240px] truncate" title={r._tkListStr}>
                {r._tkListStr || "—"}
              </td>
              <td className="p-2">
                <div className="flex gap-3 items-center">
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => setEditingId(r.id)}
                  >
                    Редактировать
                  </button>
                  <button
                    className="text-sm text-red-600 hover:underline"
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
