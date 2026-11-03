import React, { useEffect, useMemo, useState } from "react"
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
  ShieldCheck,
  AlertTriangle,
  Pencil,
  RotateCcw,
  ArchiveRestore,
} from "lucide-react"
import EditCampaignDialog from "./EditCampaignDialog"
import { getApiUrl } from "@/lib/api"
import { FORMAT_OPTIONS, CampaignInitialData } from "./AddCampaignDialog"
import { MASTER_TK_LIST } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  BookingRow,
  evaluateBookingsQueue,
  highlightActiveNavButton,
} from "@/pages/RebuildAdmin"
import { cn } from "@/lib/utils"

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

type TrashCampaignItem = {
  trashId: string
  originalId: number
  name: string
  client: string
  duration: number
  status: string
  tkType: string
  startDate: string
  endDate: string
  note: string | null
  isPaid: boolean
  formatLabel: string
  typeLabel: string
  statusLabelAtDelete: StatusLabel
  shoppingCenterNumbers: string[]
  tkListStr: string
  deletedAt: string
}

const TRASH_STORAGE_KEY = "chrono-lenta-trash-v1"
const TRASH_RETENTION_DAYS = 30
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

function loadTrashFromStorage(): TrashCampaignItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(TRASH_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TrashCampaignItem[]
    const now = Date.now()
    const valid = parsed.filter((item) => {
      const t = new Date(item.deletedAt).getTime()
      return !Number.isNaN(t) && now - t <= TRASH_RETENTION_MS
    })
    if (valid.length !== parsed.length) {
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

function saveTrashToStorage(items: TrashCampaignItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(items))
  } catch (e) {
    console.error("Failed to save trash:", e)
  }
}

// Автоматическое выравнивание шапки «Админ: управление рекламными кампаниями» в одну строку,
// уменьшение пустого пространства сверху и яркое выделение кнопки «+ Загрузка данных»
function compactAdminHeaderLayout() {
  if (typeof document === "undefined") return

  // 1. Находим заголовок «Админ: управление рекламными кампаниями» и описание под ним
  const headings = document.querySelectorAll("h1, h2, h3")
  headings.forEach((h) => {
    const text = (h.textContent || "").trim()
    if (text.includes("Админ: управление рекламными кампаниями")) {
      const headingEl = h as HTMLElement
      headingEl.style.fontSize = "14px"
      headingEl.style.fontWeight = "700"
      headingEl.style.margin = "0"
      headingEl.style.lineHeight = "1.2"
      headingEl.style.whiteSpace = "nowrap"

      const parentBox = headingEl.parentElement
      if (parentBox) {
        parentBox.style.display = "flex"
        parentBox.style.flexWrap = "wrap"
        parentBox.style.alignItems = "baseline"
        parentBox.style.gap = "10px"
        parentBox.style.margin = "0"

        const subtitle = parentBox.querySelector("p") as HTMLElement | null
        if (subtitle) {
          subtitle.style.fontSize = "11px"
          subtitle.style.margin = "0"
          subtitle.style.lineHeight = "1.2"
          subtitle.style.opacity = "0.8"
        }

        // Уменьшаем отступы у внешнего ряда-обертки, чтобы страница подтянулась вверх
        const rowWrapper = parentBox.parentElement as HTMLElement | null
        if (rowWrapper) {
          rowWrapper.style.marginBottom = "6px"
          rowWrapper.style.paddingTop = "2px"
          rowWrapper.style.paddingBottom = "2px"
          rowWrapper.style.alignItems = "center"
        }

        const pageContainer = rowWrapper?.parentElement as HTMLElement | null
        if (pageContainer) {
          pageContainer.style.paddingTop = "8px"
          pageContainer.style.paddingBottom = "8px"
        }
      }
    }
  })

  // 2. Ярко выделяем кнопку «+ Загрузка данных»
  const buttons = document.querySelectorAll("button")
  buttons.forEach((btn) => {
    const btnText = (btn.textContent || "").trim()
    if (btnText.includes("Загрузка данных") && !btnText.includes("Админ")) {
      const btnEl = btn as HTMLElement
      btnEl.style.backgroundColor = "#007aff"
      btnEl.style.backgroundImage = "linear-gradient(135deg, #007aff 0%, #2563eb 100%)"
      btnEl.style.color = "#ffffff"
      btnEl.style.fontWeight = "700"
      btnEl.style.fontSize = "11.5px"
      btnEl.style.padding = "5px 16px"
      btnEl.style.height = "30px"
      btnEl.style.borderRadius = "9999px"
      btnEl.style.border = "1px solid rgba(255, 255, 255, 0.4)"
      btnEl.style.boxShadow = "0 4px 14px rgba(0, 122, 255, 0.38)"
    }
  })
}

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

  // Выделяем кнопку «Админ (Загрузка данных)», выстраиваем заголовок в 1 линию и выделяем кнопку «+ Загрузка данных»
  useEffect(() => {
    highlightActiveNavButton("admin")
    compactAdminHeaderLayout()
  }, [])

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

  const [showTrash, setShowTrash] = useState<boolean>(false)
  const [trashItems, setTrashItems] = useState<TrashCampaignItem[]>(() => loadTrashFromStorage())
  const [lastBatchTrashIds, setLastBatchTrashIds] = useState<string[]>([])
  const [isRestoring, setIsRestoring] = useState<boolean>(false)

  const updateTrash = (updater: (prev: TrashCampaignItem[]) => TrashCampaignItem[]) => {
    setTrashItems((prev) => {
      const next = updater(prev)
      saveTrashToStorage(next)
      return next
    })
  }

  useEffect(() => {
    setSelected({})
  }, [filterStatus, filterType, filterClient, filterFormat, onlyExpiringSoon, selectedDate])

  const dateIso = format(selectedDate, "yyyy-MM-dd")
  const in3DaysIso = format(addDays(selectedDate, 3), "yyyy-MM-dd")
  const periodStartIso = format(periodStart, "yyyy-MM-dd")
  const periodEndIso = format(periodEnd, "yyyy-MM-dd")

  const evaluatedBookings = useMemo(
    () => evaluateBookingsQueue(bookings, rows),
    [bookings, rows]
  )

  const clients = Array.from(new Set(rows.map((r) => r.client))).filter(Boolean).sort()

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
        _scNums: scNums,
        _scCount: scNums.length,
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

  const filteredRows = useMemo(() => {
    return normalizedRows
      .filter((r) => (filterStatus ? r._statusLabel === filterStatus : true))
      .filter((r) => (filterType ? r._typeLabel === filterType : true))
      .filter((r) => (filterClient ? r.client === filterClient : true))
      .filter((r) => (filterFormat ? r._formatLabel === filterFormat : true))
      .filter((r) => (onlyExpiringSoon ? r._isExpiringSoon : true))
  }, [normalizedRows, filterStatus, filterType, filterClient, filterFormat, onlyExpiringSoon])

  const allCompletedRows = useMemo(
    () => normalizedRows.filter((r) => r._statusLabel === "завершён"),
    [normalizedRows]
  )

  const toggle = (id: number) => setSelected((s) => ({ ...s, [id]: !s[id] }))

  const selectAllFiltered = () => {
    const next: Record<number, boolean> = {}
    filteredRows.forEach((r) => {
      next[r.id] = true
    })
    setSelected(next)
  }

  const clearAll = () => setSelected({})

  const selectedFilteredRows = useMemo(
    () => filteredRows.filter((r) => !!selected[r.id]),
    [filteredRows, selected]
  )

  const selectedIds = useMemo(
    () => selectedFilteredRows.map((r) => r.id),
    [selectedFilteredRows]
  )

  const selectedCompletedRows = useMemo(
    () => selectedFilteredRows.filter((r) => r._statusLabel === "завершён"),
    [selectedFilteredRows]
  )

  const isAllFilteredSelected =
    filteredRows.length > 0 && selectedFilteredRows.length === filteredRows.length

  const moveCampaignsToTrash = (campaignsToTrash: typeof normalizedRows) => {
    const nowIso = new Date().toISOString()
    const newItems: TrashCampaignItem[] = campaignsToTrash.map((r) => ({
      trashId: `${r.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      originalId: r.id,
      name: r.name,
      client: r.client,
      duration: r.duration,
      status: r.status,
      tkType: r.tkType || r._formatLabel,
      startDate: r.startDate,
      endDate: r.endDate,
      note: r.note || null,
      isPaid: r._isPaid,
      formatLabel: r._formatLabel,
      typeLabel: r._typeLabel,
      statusLabelAtDelete: r._statusLabel,
      shoppingCenterNumbers: r._scNums,
      tkListStr: r._tkListStr,
      deletedAt: nowIso,
    }))
    updateTrash((prev) => [...newItems, ...prev])
    setLastBatchTrashIds(newItems.map((i) => i.trashId))
  }

  const handleDelete = async (id: number) => {
    const target = normalizedRows.find((r) => r.id === id)
    if (!target) return
    if (!window.confirm(`Удалить кампанию «${target.name}»? Она будет помещена в корзину на 30 дней.`)) return
    try {
      moveCampaignsToTrash([target])
      const res = await fetch(getApiUrl(`/api/campaigns/${id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Удаление не удалось")
      setSelected((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedFilteredRows.length === 0) return
    const completedPart = selectedCompletedRows.length
    const msg =
      filterStatus === "завершён"
        ? `Удалить выделенные завершённые кампании (${selectedFilteredRows.length} шт.)? Они будут доступны в корзине 30 дней.`
        : `Удалить выделенные в текущем списке кампании (${selectedFilteredRows.length} шт., из них завершённых: ${completedPart})? Они будут помещены в корзину на 30 дней.`

    if (!window.confirm(msg)) return
    try {
      moveCampaignsToTrash(selectedFilteredRows)
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

  const handleDeleteAllCompleted = async () => {
    const targetCompleted =
      filterStatus === "завершён" && selectedCompletedRows.length > 0
        ? selectedCompletedRows
        : allCompletedRows

    if (targetCompleted.length === 0) return
    if (
      !window.confirm(
        `Удалить завершённые рекламные кампании (${targetCompleted.length} шт.)? Кампании в статусах «опубликовано» и «запланировано» затронуты НЕ будут. Удалённые кампании сохранятся в корзине на 30 дней.`
      )
    ) {
      return
    }
    try {
      moveCampaignsToTrash(targetCompleted)
      const idsToDelete = targetCompleted.map((r) => r.id)
      const res = await fetch(getApiUrl("/api/campaigns/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      })
      if (!res.ok) throw new Error("Ошибка удаления завершённых кампаний")
      clearAll()
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(String(err))
    }
  }

  const restoreTrashItems = async (itemsToRestore: TrashCampaignItem[]) => {
    if (itemsToRestore.length === 0 || isRestoring) return
    setIsRestoring(true)
    try {
      const restoredTrashIds: string[] = []
      for (const item of itemsToRestore) {
        const payload = {
          name: item.name,
          client: item.client,
          duration: Number(item.duration),
          status: item.status || (item.isPaid ? "Платник" : "Не платник"),
          tkType: item.tkType || item.formatLabel || "ГМ",
          startDate: item.startDate,
          endDate: item.endDate,
          note: item.note ?? (item.isPaid ? "платный" : "не платный"),
          shoppingCenterNumbers: item.shoppingCenterNumbers,
        }
        const res = await fetch(getApiUrl("/api/campaigns"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          restoredTrashIds.push(item.trashId)
        }
      }
      const restoredSet = new Set(restoredTrashIds)
      updateTrash((prev) => prev.filter((i) => !restoredSet.has(i.trashId)))
      setLastBatchTrashIds((prev) => prev.filter((id) => !restoredSet.has(id)))
      queryClient.invalidateQueries()
    } catch (err) {
      window.alert(`Ошибка при восстановлении: ${String(err)}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const handleUndoLastDelete = async () => {
    const batchSet = new Set(lastBatchTrashIds)
    const items = trashItems.filter((i) => batchSet.has(i.trashId))
    await restoreTrashItems(items)
  }

  const handlePermanentDeleteTrashItem = (trashId: string) => {
    if (!window.confirm("Удалить кампанию из корзины навсегда без возможности возврата?")) return
    updateTrash((prev) => prev.filter((i) => i.trashId !== trashId))
    setLastBatchTrashIds((prev) => prev.filter((id) => id !== trashId))
  }

  const handleEmptyTrash = () => {
    if (trashItems.length === 0) return
    if (!window.confirm(`Очистить корзину (${trashItems.length} шт.) навсегда?`)) return
    updateTrash(() => [])
    setLastBatchTrashIds([])
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
        <div className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            опубликовано
          </span>
          {isExpiringSoon && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              ≤3 дн.
            </span>
          )}
        </div>
      )
    }
    if (status === "запланировано") {
      return (
        <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[9.5px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 whitespace-nowrap">
          запланировано
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[9.5px] font-medium bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/25 whitespace-nowrap">
        завершён
      </span>
    )
  }

  const getDaysRemainingInTrash = (deletedAtIso: string) => {
    const deletedMs = new Date(deletedAtIso).getTime()
    if (Number.isNaN(deletedMs)) return TRASH_RETENTION_DAYS
    const elapsedDays = Math.floor((Date.now() - deletedMs) / (24 * 60 * 60 * 1000))
    return Math.max(1, TRASH_RETENTION_DAYS - elapsedDays)
  }

  return (
    <div className="h-[calc(100vh-92px)] overflow-hidden flex flex-col gap-1.5 text-[10.5px]">
      <EditCampaignDialog
        campaignId={editingId}
        open={!!editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null)
        }}
      />

      {/* ЗАКРЕПЛЕННЫЕ ВЕРХНИЕ БЛОКИ */}
      {lastBatchTrashIds.length > 0 && (
        <div className="glass-panel shrink-0 rounded-2xl px-3.5 py-1.5 border border-amber-500/40 bg-amber-500/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-amber-900 dark:text-amber-200">
            <ArchiveRestore className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Удалено в корзину: <strong>{lastBatchTrashIds.length} РК</strong> (хранятся 30 дней).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleUndoLastDelete}
              disabled={isRestoring}
              className="h-6 px-3 text-[10.5px] rounded-full bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              {isRestoring ? "Восстановление..." : "Отменить удаление (Вернуть)"}
            </Button>
            <button
              type="button"
              onClick={() => setLastBatchTrashIds([])}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Скрыть
            </button>
          </div>
        </div>
      )}

      {/* 1. Закрепленная стеклянная панель: Статистика за период + Фильтры */}
      <div className="glass-panel shrink-0 rounded-2xl px-3 py-1.5 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold flex items-center gap-1 text-foreground text-[11px]">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              Опубликовано за период:
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2.5 text-[10.5px] font-medium rounded-full glass-pill"
                >
                  <CalendarIcon className="mr-1 h-2.5 w-2.5 text-primary" />
                  С: {format(periodStart, "dd.MM.yyyy", { locale: ru })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl glass-panel shadow-xl" align="start">
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2.5 text-[10.5px] font-medium rounded-full glass-pill"
                >
                  <CalendarIcon className="mr-1 h-2.5 w-2.5 text-primary" />
                  По: {format(periodEnd, "dd.MM.yyyy", { locale: ru })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl glass-panel shadow-xl" align="start">
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
              className="h-6 px-2 text-[10px] rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPeriodStart(startOfMonth(selectedDate))
                setPeriodEnd(endOfMonth(selectedDate))
              }}
            >
              Текущий месяц
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <div className="px-2.5 py-0.5 rounded-full glass-pill">
              Всего роликов (РК):{" "}
              <strong className="font-bold text-foreground">
                {periodPublishedStats.totalCount}
              </strong>
            </div>

            <div className="px-2.5 py-0.5 rounded-full border bg-primary/10 border-primary/30 text-primary">
              Для ГМ: <strong className="font-bold">{periodPublishedStats.gmCount}</strong> рол.
            </div>

            <div className="px-2.5 py-0.5 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
              Для СМ: <strong className="font-bold">{periodPublishedStats.smCount}</strong> рол.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Дата статуса:</span>
              <div className="inline-flex items-center gap-0.5 glass-pill rounded-full px-1 h-6">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setSelectedDate((d) => subDays(d, 1))}
                  title="Предыдущий день"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 px-1.5 text-[10.5px] font-semibold rounded-full hover:bg-transparent"
                    >
                      <CalendarIcon className="mr-1 h-2.5 w-2.5 text-primary" />
                      {format(selectedDate, "dd.MM.yyyy", { locale: ru })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl glass-panel shadow-xl" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setSelectedDate((d) => addDays(d, 1))}
                  title="Следующий день"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Статус:</span>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value)
                  setShowTrash(false)
                }}
                className="glass-pill rounded-full px-2 py-0 text-[10.5px] font-medium h-6 focus:outline-none"
              >
                <option value="">Все ({normalizedRows.length})</option>
                <option value="опубликовано">
                  опубликовано ({normalizedRows.filter((r) => r._statusLabel === "опубликовано").length})
                </option>
                <option value="запланировано">
                  запланировано ({normalizedRows.filter((r) => r._statusLabel === "запланировано").length})
                </option>
                <option value="завершён">
                  завершён ({allCompletedRows.length})
                </option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Заказчик:</span>
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="glass-pill rounded-full px-2 py-0 text-[10.5px] font-medium h-6 max-w-[140px] focus:outline-none"
              >
                <option value="">Все заказчики</option>
                {clients.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Формат:</span>
              <select
                value={filterFormat}
                onChange={(e) => setFilterFormat(e.target.value)}
                className="glass-pill rounded-full px-2 py-0 text-[10.5px] font-medium h-6 focus:outline-none"
              >
                <option value="">Все</option>
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Тип:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="glass-pill rounded-full px-2 py-0 text-[10.5px] font-medium h-6 focus:outline-none"
              >
                <option value="">Все</option>
                <option value="платный">платный</option>
                <option value="не платный">не платный</option>
              </select>
            </div>

            <label className="flex items-center gap-1 cursor-pointer select-none h-6 px-2.5 rounded-full border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
              <input
                type="checkbox"
                checked={onlyExpiringSoon}
                onChange={(e) => setOnlyExpiringSoon(e.target.checked)}
                className="rounded scale-90"
              />
              Истекают ≤ 3 дн. ({normalizedRows.filter((r) => r._isExpiringSoon).length})
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full glass-pill text-[10px] text-muted-foreground">
              Выбрано: <strong className="text-foreground">{selectedFilteredRows.length}</strong> из {filteredRows.length}
              {selectedCompletedRows.length > 0 && (
                <span className="ml-1 text-amber-700 dark:text-amber-400 font-semibold">
                  (завершённых: {selectedCompletedRows.length})
                </span>
              )}
            </span>

            {selectedFilteredRows.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2.5 text-[10px] rounded-full font-semibold"
                onClick={handleBulkDelete}
              >
                Удалить выбранные ({selectedFilteredRows.length})
              </Button>
            )}

            {allCompletedRows.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDeleteAllCompleted}
                className="h-6 px-2.5 text-[10px] gap-1 rounded-full border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20 font-semibold"
                title="Переместить все завершённые кампании в корзину на 30 дней"
              >
                <Trash2 className="w-3 h-3" />
                Удалить все завершённые (
                {filterStatus === "завершён" && selectedCompletedRows.length > 0
                  ? selectedCompletedRows.length
                  : allCompletedRows.length}
                )
              </Button>
            )}

            <button
              type="button"
              className="text-[10.5px] text-primary hover:underline font-medium px-1"
              onClick={selectAllFiltered}
            >
              Выбрать всё ({filteredRows.length})
            </button>
            <button
              type="button"
              className="text-[10.5px] text-muted-foreground hover:text-foreground hover:underline px-1"
              onClick={clearAll}
            >
              Сбросить
            </button>

            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2.5 text-[10.5px] gap-1 rounded-full glass-pill"
              onClick={handleExportCsv}
            >
              <Download className="w-3 h-3" />
              Excel
            </Button>

            <Button
              type="button"
              variant={showTrash ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTrash((v) => !v)}
              className={cn(
                "h-6 px-2.5 text-[10.5px] gap-1 rounded-full font-semibold",
                !showTrash && "glass-pill"
              )}
              title="Корзина удалённых кампаний (хранение 30 дней)"
            >
              <ArchiveRestore className="w-3 h-3" />
              Корзина ({trashItems.length})
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Закрепленная очередь бронирования от коллег */}
      {evaluatedBookings.length > 0 && !showTrash && (
        <div className="glass-panel shrink-0 rounded-2xl overflow-hidden border border-amber-500/35">
          <div className="px-3 py-1 bg-amber-500/10 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
            <div className="text-[10.5px] font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
              Очередь бронирования от коллег ({evaluatedBookings.length}):
            </div>
          </div>
          <div className="max-h-24 overflow-auto">
            <table className="w-full text-[10.5px] border-collapse">
              <thead className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[58px]">Очередь</th>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Название РК</th>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Фамилия</th>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[145px]">Даты показа</th>
                  <th className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[65px]">Формат</th>
                  <th className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[85px]">Тип</th>
                  <th className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[65px]">Хрон.</th>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Статус квоты</th>
                  <th className="px-2.5 py-1 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Список ТК</th>
                  <th className="px-2.5 py-1 text-right w-[135px]">Действия</th>
                </tr>
              </thead>
              <tbody>
                {evaluatedBookings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b last:border-b-0 border-black/[0.05] dark:border-white/[0.06] hover:bg-white/50 dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-bold">
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[9.5px]">
                        №{b._rank}
                      </span>
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-semibold">
                      {b.campaignName || "—"}
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-medium">
                      {b.surname}
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono text-[10px]">
                      {b.startDate} — {b.endDate}
                    </td>
                    <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center">
                      <span className="px-1.5 py-0.2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] font-semibold text-[9.5px]">
                        {b.format}
                      </span>
                    </td>
                    <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center whitespace-nowrap">
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded-full font-semibold text-[9.5px]",
                          b._isPaid
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {b.payerType}
                      </span>
                    </td>
                    <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center font-mono font-bold text-primary whitespace-nowrap">
                      {b.duration} сек
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                      {b._alertLevel === "ok" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold text-[9.5px]">
                          <ShieldCheck className="w-3 h-3" /> В квоте
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-white font-bold text-[9.5px]",
                            b._alertLevel === "red" ? "bg-red-600" : "bg-orange-500"
                          )}
                          title={b._conflicts.map((c) => `ТК №${c.tkNumber}: ${c.reason}`).join("; ")}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {b._alertLevel === "red" ? "Красный перегруз" : "Оранж. перегруз"} ({b._conflicts.length} ТК)
                        </span>
                      )}
                    </td>
                    <td
                      className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] max-w-[220px] truncate"
                      title={b.tkNumbersRaw}
                    >
                      <strong>{b.shoppingCenterNumbers.length} ТК</strong> ({b.tkNumbersRaw})
                    </td>
                    <td className="px-2.5 py-1 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {onDuplicate && (
                          <button
                            type="button"
                            onClick={() =>
                              onDuplicate({
                                name: b.campaignName || `Бронь: ${b.surname}`,
                                startDate: b.startDate,
                                endDate: b.endDate,
                                client: b.surname,
                                duration: b.duration,
                                format: b.format,
                                type: b._isPaid ? "Платник" : "Не платник",
                                shoppingCenterNumbers: b.tkNumbersRaw,
                              })
                            }
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold hover:bg-emerald-500/25 transition-colors"
                          >
                            <ArrowRightCircle className="w-3 h-3" />
                            В эфир
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(b.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-red-600 hover:underline"
                        >
                          <Trash2 className="w-3 h-3" />
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isError && (
        <div className="p-2.5 shrink-0 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-center justify-between">
          <span>Ошибка загрузки кампаний: {(error as Error)?.message || "Сервер недоступен"}</span>
          <Button variant="outline" size="sm" className="h-6 text-xs rounded-full" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      )}

      {/* 3. ПРОКРУЧИВАЕМОЕ ОКНО С ДАННЫМИ */}
      {showTrash ? (
        <div className="glass-panel rounded-2xl overflow-hidden border border-primary/40 flex-1 min-h-0 flex flex-col">
          <div className="px-3.5 py-2 shrink-0 bg-primary/10 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold flex items-center gap-1.5 text-foreground">
                <ArchiveRestore className="w-3.5 h-3.5 text-primary" />
                Корзина удалённых кампаний ({trashItems.length}) — хранение 30 дней
              </div>
              <p className="text-[10px] text-muted-foreground">
                При восстановлении кампания возвращается в базу со всеми своими ТК, датами и хронометражем
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {trashItems.length > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={() => restoreTrashItems(trashItems)}
                    disabled={isRestoring}
                    className="h-6 px-2.5 text-[10px] rounded-full gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {isRestoring ? "Восстановление..." : `Восстановить все (${trashItems.length})`}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleEmptyTrash}
                    className="h-6 px-2.5 text-[10px] rounded-full"
                  >
                    Очистить корзину
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTrash(false)}
                className="h-6 px-2 text-[10px] rounded-full"
              >
                Вернуться к списку РК
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10.5px] border-collapse">
              <thead className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Название РК</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">Статус при удалении</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">Период показа</th>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Заказчик</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">Хрон.</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">Формат / Тип</th>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Список ТК</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">Хранение</th>
                  <th className="px-2.5 py-1.5 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {trashItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Корзина пуста. Удалённые кампании хранятся здесь в течение 30 дней.
                    </td>
                  </tr>
                ) : (
                  trashItems.map((item) => (
                    <tr
                      key={item.trashId}
                      className="border-b last:border-b-0 border-black/[0.05] dark:border-white/[0.06] hover:bg-white/50 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-semibold">
                        {item.name}
                      </td>
                      <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06]">
                        {renderStatusBadge(item.statusLabelAtDelete, false)}
                      </td>
                      <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] font-mono text-[10px] whitespace-nowrap">
                        {item.startDate} — {item.endDate}
                      </td>
                      <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06]">
                        {item.client}
                      </td>
                      <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] font-mono font-bold text-primary">
                        {item.duration} сек
                      </td>
                      <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                        {item.formatLabel} • {item.typeLabel}
                      </td>
                      <td
                        className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] max-w-[220px] truncate"
                        title={item.tkListStr}
                      >
                        <strong>{item.shoppingCenterNumbers.length} ТК:</strong> {item.tkListStr}
                      </td>
                      <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                        Осталось {getDaysRemainingInTrash(item.deletedAt)} дн.
                      </td>
                      <td className="px-2.5 py-1 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isRestoring}
                            onClick={() => restoreTrashItems([item])}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold hover:bg-emerald-500/25"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Восстановить
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePermanentDeleteTrashItem(item.trashId)}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Навсегда
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10.5px] border-collapse">
              <thead className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] text-muted-foreground shadow-2xs">
                <tr>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[32px]">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={(e) => (e.target.checked ? selectAllFiltered() : clearAll())}
                      className="rounded scale-90"
                      title="Выбрать все кампании в текущем отфильтрованном списке"
                    />
                  </th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[38px]">#</th>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Название</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[125px]">Статус</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[88px]">Дата старта</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[95px]">Дата оконч.</th>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[135px]">Заказчик</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[75px]">Хрон.</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[65px]">Формат</th>
                  <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[85px]">Тип</th>
                  <th className="px-2.5 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Список ТК</th>
                  <th className="px-2.5 py-1.5 text-right w-[195px]">Действия</th>
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
                      Нет рекламных кампаний по выбранным фильтрам
                    </td>
                  </tr>
                )}
                {filteredRows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b last:border-b-0 border-black/[0.05] dark:border-white/[0.06] hover:bg-white/50 dark:hover:bg-white/[0.04] transition-colors align-middle",
                      selected[r.id] && "bg-primary/10 dark:bg-primary/15"
                    )}
                  >
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06]">
                      <input
                        type="checkbox"
                        checked={!!selected[r.id]}
                        onChange={() => toggle(r.id)}
                        className="rounded scale-90"
                      />
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] text-muted-foreground font-mono">
                      {idx + 1}
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-semibold">
                      {r.name}
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06]">
                      {renderStatusBadge(r._statusLabel, r._isExpiringSoon)}
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono text-[10px]">
                      {r.startDate}
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono text-[10px]">
                      {r.endDate}
                    </td>
                    <td className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-medium truncate max-w-[135px]">
                      {r.client}
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono font-bold text-primary">
                      {r.duration} сек
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                      <span className="px-1.5 py-0.2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] font-semibold text-[9.5px]">
                        {r._formatLabel}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded-full font-semibold text-[9.5px]",
                          r._isPaid
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {r._typeLabel}
                      </span>
                    </td>
                    <td
                      className="px-2.5 py-1 border-r border-black/[0.05] dark:border-white/[0.06] max-w-[240px] truncate"
                      title={r._tkListStr}
                    >
                      {r._scCount > 0 ? (
                        <>
                          <strong className="mr-1">{r._scCount} ТК:</strong>
                          <span className="text-muted-foreground">{r._tkListStr}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2.5 py-1 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2 items-center">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium"
                          onClick={() => setEditingId(r.id)}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          Ред.
                        </button>
                        {onDuplicate && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
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
                            <Copy className="w-2.5 h-2.5" /> Копия
                          </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[10px] text-red-600 hover:underline font-medium"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default CampaignsTable
