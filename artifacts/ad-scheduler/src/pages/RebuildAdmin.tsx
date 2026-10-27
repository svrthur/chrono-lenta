import React, { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, addDays, subDays } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  ArrowUpDown,
  LayoutGrid,
  ListFilter,
  Search,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Download,
  Clock,
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  BookmarkCheck,
  CheckIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  ShieldCheck,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react"
import { CITIES, MASTER_TK_LIST, TK_QUOTAS } from "@/lib/constants"
import { getApiUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { DURATION_OPTIONS, FORMAT_OPTIONS } from "@/components/AddCampaignDialog"
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

export type BookingRow = {
  id: number
  surname: string
  startDate: string
  endDate: string
  format: string
  payerType: string
  duration: number
  shoppingCenterNumbers: string[]
  tkNumbersRaw: string
  createdAt: string
}

export type BookingConflictDetail = {
  tkNumber: string
  city: string
  peakDate: string
  totalSec: number
  paidSec: number
  freeSec: number
  level: "alert" | "warning"
  priorBookingsInTk: string[]
}

export type EvaluatedBooking = BookingRow & {
  _rank: number
  _isPaid: boolean
  _scSet: Set<string>
  _hasConflict: boolean
  _hasWarning: boolean
  _conflicts: BookingConflictDetail[]
}

export type CampaignStatusLabel = "опубликовано" | "запланировано" | "завершён"

const TOTAL_TK_COUNT = MASTER_TK_LIST.length
const TOTAL_GM_COUNT = MASTER_TK_LIST.filter((t) => t.format === "ГМ").length
const TOTAL_SM_COUNT = MASTER_TK_LIST.filter((t) => t.format === "СМ").length

async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await fetch(getApiUrl("/api/campaigns"))
  if (!res.ok) throw new Error("Ошибка загрузки данных")
  return res.json()
}

async function fetchBookings(): Promise<BookingRow[]> {
  const res = await fetch(getApiUrl("/api/bookings"))
  if (!res.ok) return []
  return res.json()
}

function formatShortDate(iso: string) {
  if (!iso) return ""
  const parts = iso.split("-")
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : iso
}

function formatDateTimeRu(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// Проверка новых правил лимитов:
// 1) Общий > 180с -> Тревога (красный)
// 2) Платный > 125с -> Тревога (красный)
// 3) Бесплатный: остаток <= 0с (занято >= 55с) -> Тревога (красный)
// 4) Бесплатный: остаток от 1 до 10с (занято 45..50с) И в платном свободно < 20с (занято > 105с) -> Предупреждение (оранжевый)
export function checkQuotaStatus(paidSec: number, freeSec: number, futurePeakTotalSec = 0) {
  const totalSec = paidSec + freeSec
  const paidRemaining = TK_QUOTAS.PAID_MAX - paidSec
  const freeRemaining = TK_QUOTAS.FREE_MAX - freeSec
  const totalRemaining = TK_QUOTAS.TOTAL_MAX - totalSec

  const isOverTotalNow = totalSec > TK_QUOTAS.TOTAL_MAX
  const isOverTotalFuture = futurePeakTotalSec > TK_QUOTAS.TOTAL_MAX
  const isOverTotal = isOverTotalNow || isOverTotalFuture
  const isOverPaid = paidSec > TK_QUOTAS.PAID_MAX
  const isOverFree = freeRemaining <= 0 // осталось 0 сек или меньше (занято >= 55 сек)

  // Если в платном свободно >= 20 сек, предупреждение у бесплатных НЕ показываем
  const isWarningFree =
    !isOverFree && freeRemaining > 0 && freeRemaining <= 10 && paidRemaining < 20

  const isRedAlert = isOverTotal || isOverPaid || isOverFree
  const isOrangeWarning = !isRedAlert && isWarningFree

  return {
    totalSec,
    paidRemaining,
    freeRemaining,
    totalRemaining,
    isOverTotalNow,
    isOverTotalFuture,
    isOverTotal,
    isOverPaid,
    isOverFree,
    isWarningFree,
    isRedAlert,
    isOrangeWarning,
  }
}

export function evaluateBookingsQueue(
  rawBookings: BookingRow[],
  rawCampaigns: CampaignRow[]
): EvaluatedBooking[] {
  const sorted = [...rawBookings].sort((a, b) => {
    const tA = new Date(a.createdAt).getTime() || 0
    const tB = new Date(b.createdAt).getTime() || 0
    if (tA !== tB) return tA - tB
    return a.id - b.id
  })

  const preparedCampaigns = rawCampaigns.map((c) => {
    const isPaid =
      c.status === "Платник" ||
      c.status === "платный" ||
      (c.note && c.note.toLowerCase().includes("платн") && !c.note.toLowerCase().includes("не "))
    const scSet = new Set((c.shoppingCenters || []).map((s) => String(s.number).trim()))
    return {
      startDate: String(c.startDate),
      endDate: String(c.endDate),
      duration: Number(c.duration) || 0,
      isPaid: Boolean(isPaid),
      scSet,
    }
  })

  const evaluated: EvaluatedBooking[] = []

  for (let idx = 0; idx < sorted.length; idx++) {
    const b = sorted[idx]
    const rank = idx + 1
    const bIsPaid =
      b.payerType.toLowerCase().includes("плат") &&
      !b.payerType.toLowerCase().includes("бес")
    const bScSet = new Set(b.shoppingCenterNumbers.map((n) => String(n).trim()).filter(Boolean))
    const bStart = b.startDate
    const bEnd = b.endDate
    const bDur = Number(b.duration) || 0

    const priorBookings = evaluated.slice(0, idx)
    const conflicts: BookingConflictDetail[] = []

    for (const tkNum of Array.from(bScSet)) {
      const overlappingCamps = preparedCampaigns.filter(
        (c) => c.scSet.has(tkNum) && c.startDate <= bEnd && c.endDate >= bStart
      )
      const overlappingPriorBookings = priorBookings.filter(
        (pb) => pb._scSet.has(tkNum) && pb.startDate <= bEnd && pb.endDate >= bStart
      )

      const candidateDates = new Set<string>([bStart])
      for (const c of overlappingCamps) {
        if (c.startDate >= bStart && c.startDate <= bEnd) candidateDates.add(c.startDate)
      }
      for (const pb of overlappingPriorBookings) {
        if (pb.startDate >= bStart && pb.startDate <= bEnd) candidateDates.add(pb.startDate)
      }

      let maxTotal = 0
      let maxPaid = 0
      let maxFree = 0
      let worstDate = bStart
      let worstPriorNames: string[] = []

      for (const d of Array.from(candidateDates).sort()) {
        let paid = bIsPaid ? bDur : 0
        let free = bIsPaid ? 0 : bDur
        const activePriorsOnDate: string[] = []

        for (const c of overlappingCamps) {
          if (c.startDate <= d && c.endDate >= d) {
            if (c.isPaid) paid += c.duration
            else free += c.duration
          }
        }
        for (const pb of overlappingPriorBookings) {
          if (pb.startDate <= d && pb.endDate >= d) {
            if (pb._isPaid) paid += pb.duration
            else free += pb.duration
            activePriorsOnDate.push(`№${pb._rank} (${pb.surname}, ${pb.duration}с)`)
          }
        }

        const total = paid + free
        if (total > maxTotal || paid > maxPaid || free > maxFree) {
          maxTotal = Math.max(maxTotal, total)
          maxPaid = Math.max(maxPaid, paid)
          maxFree = Math.max(maxFree, free)
          worstDate = d
          worstPriorNames = activePriorsOnDate
        }
      }

      const qStatus = checkQuotaStatus(maxPaid, maxFree)
      if (qStatus.isRedAlert || qStatus.isOrangeWarning) {
        const tkInfo = MASTER_TK_LIST.find((t) => t.number === tkNum)
        conflicts.push({
          tkNumber: tkNum,
          city: tkInfo?.city || "",
          peakDate: worstDate,
          totalSec: maxTotal,
          paidSec: maxPaid,
          freeSec: maxFree,
          level: qStatus.isRedAlert ? "alert" : "warning",
          priorBookingsInTk: worstPriorNames,
        })
      }
    }

    evaluated.push({
      ...b,
      _rank: rank,
      _isPaid: bIsPaid,
      _scSet: bScSet,
      _hasConflict: conflicts.some((c) => c.level === "alert"),
      _hasWarning: conflicts.some((c) => c.level === "warning"),
      _conflicts: conflicts,
    })
  }

  return evaluated
}

export function RebuildAdmin() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: rawCampaigns = [], isLoading } = useQuery<CampaignRow[]>({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  })

  const { data: rawBookings = [] } = useQuery<BookingRow[]>({
    queryKey: ["bookings"],
    queryFn: fetchBookings,
  })

  const [viewMode, setViewMode] = useState<"list" | "matrix" | "bookings">("list")
  const [bookingDialogOpen, setBookingDialogOpen] = useState<boolean>(false)

  // По умолчанию показываем чистый эфир БЕЗ учета брони (false). Кнопка «Учитывать бронь» включает перерасчет.
  const [includeBookingsInTk, setIncludeBookingsInTk] = useState<boolean>(false)

  // Состояние развернутых строк ТК в столбце «Рекламные кампании»
  const [expandedTks, setExpandedTks] = useState<Record<string, boolean>>({})

  // Поля формы нового бронирования
  const [bSurname, setBSurname] = useState<string>("")
  const [bStartDate, setBStartDate] = useState<Date | undefined>(undefined)
  const [bEndDate, setBEndDate] = useState<Date | undefined>(undefined)
  const [bFormat, setBFormat] = useState<string>("")
  const [bPayerType, setBPayerType] = useState<string>("")
  const [bDuration, setBDuration] = useState<string>("")
  const [bTkNumbers, setBTkNumbers] = useState<string>("")
  const [bShowPicker, setBShowPicker] = useState<boolean>(false)
  const [bPickerSearch, setBPickerSearch] = useState<string>("")
  const [bSaving, setBSaving] = useState<boolean>(false)

  // Фильтры ТК и РК
  const [tkFormatFilter, setTkFormatFilter] = useState<"ALL" | "ГМ" | "СМ">("ALL")
  const [cityFilter, setCityFilter] = useState<string>("")
  const [searchTk, setSearchTk] = useState<string>("")
  const [onlyWithAds, setOnlyWithAds] = useState<boolean>(false)
  const [onlyOverLimit, setOnlyOverLimit] = useState<boolean>(false)
  const [onlyWarnings, setOnlyWarnings] = useState<boolean>(false)

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

  const evaluatedBookings = useMemo(
    () => evaluateBookingsQueue(rawBookings, rawCampaigns),
    [rawBookings, rawCampaigns]
  )

  const bSelectedSet = useMemo(() => {
    return new Set(
      bTkNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }, [bTkNumbers])

  const draftBookingConflicts = useMemo(() => {
    if (!bStartDate || !bEndDate || !bDuration || !bPayerType || bSelectedSet.size === 0) {
      return []
    }
    const startIso = format(bStartDate, "yyyy-MM-dd")
    const endIso = format(bEndDate, "yyyy-MM-dd")
    if (startIso > endIso) return []

    const tempBooking: BookingRow = {
      id: 999999999,
      surname: bSurname.trim() || "Новая бронь",
      startDate: startIso,
      endDate: endIso,
      format: bFormat || "ГМ",
      payerType: bPayerType,
      duration: Number(bDuration) || 0,
      shoppingCenterNumbers: Array.from(bSelectedSet),
      tkNumbersRaw: Array.from(bSelectedSet).join(", "),
      createdAt: new Date(8640000000000000).toISOString(),
    }

    const sim = evaluateBookingsQueue([...rawBookings, tempBooking], rawCampaigns)
    const last = sim[sim.length - 1]
    return last ? last._conflicts : []
  }, [bStartDate, bEndDate, bDuration, bPayerType, bSelectedSet, bSurname, bFormat, rawBookings, rawCampaigns])

  const updateBTkFromSet = (nextSet: Set<string>) => {
    const ordered = MASTER_TK_LIST.filter((t) => nextSet.has(t.number)).map((t) => t.number)
    const custom = Array.from(nextSet).filter((n) => !MASTER_TK_LIST.some((t) => t.number === n))
    setBTkNumbers([...ordered, ...custom].join(", "))
  }

  const fillBTkByFormat = (fmt: "ГМ" | "СМ" | "ГМ+СМ") => {
    if (fmt === "ГМ+СМ") {
      setBTkNumbers(MASTER_TK_LIST.map((t) => t.number).join(", "))
      return
    }
    setBTkNumbers(MASTER_TK_LIST.filter((t) => t.format === fmt).map((t) => t.number).join(", "))
  }

  const handleBFormatChange = (v: string) => {
    setBFormat(v)
    if (v === "ГМ") fillBTkByFormat("ГМ")
    else if (v === "СМ") fillBTkByFormat("СМ")
    else if (v === "ГМ+СМ") fillBTkByFormat("ГМ+СМ")
  }

  const toggleBCityTks = (city: string) => {
    const next = new Set(bSelectedSet)
    const cityTks = MASTER_TK_LIST.filter((t) => {
      if (t.city !== city) return false
      if (bFormat === "ГМ" || bFormat === "част.ГМ") return t.format === "ГМ"
      if (bFormat === "СМ" || bFormat === "част.СМ") return t.format === "СМ"
      return true
    })
    const allSelected = cityTks.length > 0 && cityTks.every((t) => next.has(t.number))
    for (const tk of cityTks) {
      if (allSelected) next.delete(tk.number)
      else next.add(tk.number)
    }
    updateBTkFromSet(next)
  }

  const toggleBSingleTk = (num: string) => {
    const next = new Set(bSelectedSet)
    if (next.has(num)) next.delete(num)
    else next.add(num)
    updateBTkFromSet(next)
  }

  const bFilteredMasterList = useMemo(() => {
    return MASTER_TK_LIST.filter((tk) => {
      if (bFormat === "ГМ" || bFormat === "част.ГМ") {
        if (tk.format !== "ГМ") return false
      } else if (bFormat === "СМ" || bFormat === "част.СМ") {
        if (tk.format !== "СМ") return false
      }
      if (bPickerSearch.trim()) {
        const q = bPickerSearch.trim().toLowerCase()
        return (
          tk.number.toLowerCase().includes(q) ||
          tk.city.toLowerCase().includes(q) ||
          tk.address.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [bFormat, bPickerSearch])

  const resetBookingForm = () => {
    setBSurname("")
    setBStartDate(undefined)
    setBEndDate(undefined)
    setBFormat("")
    setBPayerType("")
    setBDuration("")
    setBTkNumbers("")
    setBShowPicker(false)
    setBPickerSearch("")
  }

  const handleSaveBooking = async () => {
    if (!bSurname.trim()) {
      return toast({ title: "Укажите фамилию", variant: "destructive" })
    }
    if (!bStartDate || !bEndDate) {
      return toast({ title: "Выберите даты показа", variant: "destructive" })
    }
    if (bStartDate > bEndDate) {
      return toast({ title: "Дата окончания раньше даты старта", variant: "destructive" })
    }
    if (!bFormat) {
      return toast({ title: "Выберите формат", variant: "destructive" })
    }
    if (!bPayerType) {
      return toast({ title: "Выберите тип (платная / бесплатная)", variant: "destructive" })
    }
    if (!bDuration) {
      return toast({ title: "Выберите хронометраж", variant: "destructive" })
    }
    if (bSelectedSet.size === 0) {
      return toast({ title: "Укажите список ТК", variant: "destructive" })
    }

    setBSaving(true)
    try {
      const body = {
        surname: bSurname.trim(),
        startDate: format(bStartDate, "yyyy-MM-dd"),
        endDate: format(bEndDate, "yyyy-MM-dd"),
        format: bFormat,
        payerType: bPayerType,
        duration: Number(bDuration),
        shoppingCenterNumbers: Array.from(bSelectedSet),
      }
      const res = await fetch(getApiUrl("/api/bookings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }
      toast({ title: "Бронь добавлена в список", variant: "success" })
      queryClient.invalidateQueries({ queryKey: ["bookings"] })
      resetBookingForm()
      setBookingDialogOpen(false)
      setViewMode("bookings")
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" })
    } finally {
      setBSaving(false)
    }
  }

  const handleDeleteBooking = async (id: number, surname: string) => {
    if (!window.confirm(`Удалить бронь (${surname}) из списка?`)) return
    try {
      const res = await fetch(getApiUrl(`/api/bookings/${id}`), { method: "DELETE" })
      if (!res.ok) throw new Error("Не удалось удалить бронь")
      queryClient.invalidateQueries({ queryKey: ["bookings"] })
    } catch (err: any) {
      toast({ title: "Ошибка", description: String(err.message || err), variant: "destructive" })
    }
  }

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
      const getVal = (item: typeof
