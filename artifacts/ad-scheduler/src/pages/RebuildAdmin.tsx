import React, { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, addDays, subDays } from "date-fns"
import { ru } from "date-fns/locale"
import {
  CalendarIcon,
  LayoutGrid,
  ListFilter,
  RotateCcw,
  AlertTriangle,
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
  XCircle,
} from "lucide-react"
import {
  CITIES,
  MASTER_TK_LIST,
  TK_QUOTAS,
  QuotaAlertLevel,
  evaluateTkQuota,
  parseAndValidateTkNumbers,
} from "@/lib/constants"
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
  campaignName: string
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
  level: "orange" | "red"
  reason: string
  totalSec: number
  paidSec: number
  freeSec: number
  paidRemainingSec: number
  priorBookingsInTk: string[]
}

export type EvaluatedBooking = BookingRow & {
  _rank: number
  _isPaid: boolean
  _scSet: Set<string>
  _alertLevel: QuotaAlertLevel
  _hasConflict: boolean
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

      let worstLevel: QuotaAlertLevel = "ok"
      let worstEval = evaluateTkQuota(0, 0)
      let worstDate = bStart
      let worstPriorNames: string[] = []

      const severityRank = (lvl: QuotaAlertLevel) => (lvl === "red" ? 2 : lvl === "orange" ? 1 : 0)

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

        const qEval = evaluateTkQuota(paid, free)
        if (
          severityRank(qEval.level) > severityRank(worstLevel) ||
          (severityRank(qEval.level) === severityRank(worstLevel) && qEval.totalSec > worstEval.totalSec)
        ) {
          worstLevel = qEval.level
          worstEval = qEval
          worstDate = d
          worstPriorNames = activePriorsOnDate
        }
      }

      if (worstLevel === "red" || worstLevel === "orange") {
        const tkInfo = MASTER_TK_LIST.find((t) => t.number === tkNum)
        conflicts.push({
          tkNumber: tkNum,
          city: tkInfo?.city || "",
          peakDate: worstDate,
          level: worstLevel,
          reason: worstEval.reason,
          totalSec: worstEval.totalSec,
          paidSec: worstEval.paidSec,
          freeSec: worstEval.freeSec,
          paidRemainingSec: worstEval.paidRemainingSec,
          priorBookingsInTk: worstPriorNames,
        })
      }
    }

    const hasRed = conflicts.some((c) => c.level === "red")
    const hasOrange = conflicts.some((c) => c.level === "orange")
    const overallLevel: QuotaAlertLevel = hasRed ? "red" : hasOrange ? "orange" : "ok"

    evaluated.push({
      ...b,
      _rank: rank,
      _isPaid: bIsPaid,
      _scSet: bScSet,
      _alertLevel: overallLevel,
      _hasConflict: overallLevel !== "ok",
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as any })
  }, [viewMode])

  // По умолчанию отключено: показывать только основной хронометраж
  const [includeBookingsInTk, setIncludeBookingsInTk] = useState<boolean>(false)

  // Раскрытие строк в столбце РК
  const [expandedTkSet, setExpandedTkSet] = useState<Set<string>>(new Set())

  const toggleExpandTk = (tkNum: string) => {
    setExpandedTkSet((prev) => {
      const next = new Set(prev)
      if (next.has(tkNum)) next.delete(tkNum)
      else next.add(tkNum)
      return next
    })
  }

  // Поля формы бронирования
  const [bCampaignName, setBCampaignName] = useState<string>("")
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
  const [onlyOverLimit, setOnlyOverLimit] = useState<boolean>(false)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [statusFilter, setStatusFilter] = useState<
    "all" | "опубликовано" | "запланировано" | "завершён"
  >("all")

  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>("")
  const [campaignFormatFilter, setCampaignFormatFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState<boolean>(false)

  const dateIso = format(selectedDate, "yyyy-MM-dd")
  const in3DaysIso = format(addDays(selectedDate, 3), "yyyy-MM-dd")

  const evaluatedBookings = useMemo(
    () => evaluateBookingsQueue(rawBookings, rawCampaigns),
    [rawBookings, rawCampaigns]
  )

  // Проверка чужих ТК в строке бронирования
  const bParsedTk = useMemo(() => parseAndValidateTkNumbers(bTkNumbers), [bTkNumbers])
  const bSelectedSet = useMemo(() => new Set(bParsedTk.validNumbers), [bParsedTk.validNumbers])

  const removeUnknownBTks = () => {
    setBTkNumbers(bParsedTk.validNumbers.join(", "))
  }

  // Превентивная проверка конфликтов в окне Бронирования
  const draftBookingConflicts = useMemo(() => {
    if (!bStartDate || !bEndDate || !bDuration || !bPayerType || bSelectedSet.size === 0) {
      return []
    }
    const startIso = format(bStartDate, "yyyy-MM-dd")
    const endIso = format(bEndDate, "yyyy-MM-dd")
    if (startIso > endIso) return []

    const tempBooking: BookingRow = {
      id: 999999999,
      campaignName: bCampaignName.trim() || "Новая бронь",
      surname: bSurname.trim() || "Сотрудник",
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
  }, [bStartDate, bEndDate, bDuration, bPayerType, bSelectedSet, bCampaignName, bSurname, bFormat, rawBookings, rawCampaigns])

  const draftRedConflicts = useMemo(
    () => draftBookingConflicts.filter((c) => c.level === "red"),
    [draftBookingConflicts]
  )
  const draftOrangeConflicts = useMemo(
    () => draftBookingConflicts.filter((c) => c.level === "orange"),
    [draftBookingConflicts]
  )

  const updateBTkFromSet = (nextSet: Set<string>) => {
    const ordered = MASTER_TK_LIST.filter((t) => nextSet.has(t.number)).map((t) => t.number)
    setBTkNumbers(ordered.join(", "))
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
  }

  const toggleCityFormatTks = (city: string, targetFmt: "ГМ" | "СМ") => {
    const next = new Set(bSelectedSet)
    const matched = MASTER_TK_LIST.filter((t) => t.city === city && t.format === targetFmt)
    const allSelected = matched.length > 0 && matched.every((t) => next.has(t.number))
    for (const tk of matched) {
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
    setBCampaignName("")
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
    if (!bCampaignName.trim()) {
      return toast({ title: "Укажите название РК", variant: "destructive" })
    }
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
    if (bParsedTk.unknownNumbers.length > 0) {
      return toast({
        title: "Обнаружены чужие ТК",
        description: `ТК №${bParsedTk.unknownNumbers.join(", ")} к нам не относятся. Нажмите «Удалить лишние ТК».`,
        variant: "destructive",
      })
    }
    if (bSelectedSet.size === 0) {
      return toast({ title: "Укажите список ТК из нашей сети", variant: "destructive" })
    }

    setBSaving(true)
    try {
      const body = {
        campaignName: bCampaignName.trim(),
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
      toast({ title: "Бронь успешно добавлена", variant: "success" })
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
      return true
    })

    list.sort((a, b) => a.client.localeCompare(b.client, "ru"))
    return list
  }, [
    enrichedCampaigns,
    campaignTypeFilter,
    campaignFormatFilter,
    clientFilter,
    onlyExpiringSoon,
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
    return baseFilteredCampaigns
  }, [statusFilter, publishedCampaigns, plannedCampaigns, finishedCampaigns, baseFilteredCampaigns])

  const activeBookingsOnDate = useMemo(() => {
    return evaluatedBookings.filter((b) => {
      if (b.startDate > dateIso || b.endDate < dateIso) return false
      if (campaignTypeFilter) {
        const bTypeNorm = b._isPaid ? "платный" : "не платный"
        if (bTypeNorm !== campaignTypeFilter) return false
      }
      if (campaignFormatFilter && b.format !== campaignFormatFilter) return false
      return true
    })
  }, [evaluatedBookings, dateIso, campaignTypeFilter, campaignFormatFilter])

  const filteredTkRows = useMemo(() => {
    return MASTER_TK_LIST.map((tk) => {
      const activeList = publishedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const plannedList = plannedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const shownList = displayedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const bookingsInTk = activeBookingsOnDate.filter((b) => b._scSet.has(tk.number))

      const airPaidDuration = activeList
        .filter((c) => c._isPaid)
        .reduce((sum, c) => sum + (c.duration || 0), 0)
      const airFreeDuration = activeList
        .filter((c) => !c._isPaid)
        .reduce((sum, c) => sum + (c.duration || 0), 0)
      const airTotalDuration = airPaidDuration + airFreeDuration

      const bookedPaidDuration = bookingsInTk
        .filter((b) => b._isPaid)
        .reduce((sum, b) => sum + (b.duration || 0), 0)
      const bookedFreeDuration = bookingsInTk
        .filter((b) => !b._isPaid)
        .reduce((sum, b) => sum + (b.duration || 0), 0)
      const bookedTotalDuration = bookedPaidDuration + bookedFreeDuration

      const paidDuration = includeBookingsInTk
        ? airPaidDuration + bookedPaidDuration
        : airPaidDuration
      const freeDuration = includeBookingsInTk
        ? airFreeDuration + bookedFreeDuration
        : airFreeDuration
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

      const quotaEval = evaluateTkQuota(paidDuration, freeDuration)
      const alertLevel = quotaEval.level
      const isOverLimit = alertLevel === "red" || alertLevel === "orange"

      const hasAnyItems =
        shownList.length > 0 || (includeBookingsInTk && bookingsInTk.length > 0)

      return {
        ...tk,
        activeList,
        plannedList,
        shownList,
        bookingsInTk,
        airTotalDuration,
        airPaidDuration,
        airFreeDuration,
        bookedPaidDuration,
        bookedFreeDuration,
        bookedTotalDuration,
        totalDuration,
        paidDuration,
        freeDuration,
        plannedDuration,
        paidRemainingSec: quotaEval.paidRemainingSec,
        alertLevel,
        alertReason: quotaEval.reason,
        isOverTotal: quotaEval.isOverTotal,
        isOverPaid: quotaEval.isOverPaid,
        isOverLimit,
        earliestEndDate,
        freedSeconds,
        hasAnyItems,
      }
    }).filter((tk) => {
      if (tkFormatFilter !== "ALL" && tk.format !== tkFormatFilter) return false
      if (cityFilter && tk.city !== cityFilter) return false
      if (onlyOverLimit && !tk.isOverLimit) return false
      return true
    })
  }, [
    tkFormatFilter,
    cityFilter,
    onlyOverLimit,
    publishedCampaigns,
    plannedCampaigns,
    displayedCampaigns,
    activeBookingsOnDate,
    includeBookingsInTk,
  ])

  const allExpandableNums = useMemo(
    () => filteredTkRows.filter((t) => t.hasAnyItems || t.plannedList.length > 0).map((t) => t.number),
    [filteredTkRows]
  )
  const areAllExpanded =
    allExpandableNums.length > 0 && allExpandableNums.every((n) => expandedTkSet.has(n))

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedTkSet(new Set())
    } else {
      setExpandedTkSet(new Set(allExpandableNums))
    }
  }

  const stats = useMemo(() => {
    const visibleTkNums = new Set(filteredTkRows.map((t) => t.number))
    const inVisible = (list: typeof publishedCampaigns) =>
      list.filter((c) => Array.from(c._scNumbersSet).some((num) => visibleTkNums.has(num)))

    const pubVis = inVisible(publishedCampaigns)
    const planVis = inVisible(plannedCampaigns)
    const finVis = inVisible(finishedCampaigns)
    const redTkCount = filteredTkRows.filter((t) => t.alertLevel === "red").length
    const orangeTkCount = filteredTkRows.filter((t) => t.alertLevel === "orange").length
    const conflictBookingsCount = evaluatedBookings.filter((b) => b._hasConflict).length

    return {
      totalTk: filteredTkRows.length,
      gmCount: filteredTkRows.filter((t) => t.format === "ГМ").length,
      smCount: filteredTkRows.filter((t) => t.format === "СМ").length,
      tkBroadcastingCount: filteredTkRows.filter((t) => t.activeList.length > 0).length,
      tkPlannedCount: filteredTkRows.filter((t) => t.plannedList.length > 0).length,
      overLimitTkCount: redTkCount + orangeTkCount,
      redTkCount,
      orangeTkCount,
      expiringCount: pubVis.filter((c) => c._isExpiringSoon).length,
      publishedCount: pubVis.length,
      plannedCount: planVis.length,
      finishedCount: finVis.length,
      conflictBookingsCount,
    }
  }, [filteredTkRows, publishedCampaigns, plannedCampaigns, finishedCampaigns, evaluatedBookings])

  const handleExportTkCsv = () => {
    const headers = [
      "№ ТК",
      "Формат",
      "Город",
      "Адрес",
      `Суммарно сек (лимит ${TK_QUOTAS.TOTAL_MAX})`,
      `Платно сек (лимит ${TK_QUOTAS.PAID_MAX})`,
      "Свободно в платном (сек)",
      `Бесплатно сек (база ${TK_QUOTAS.FREE_MAX})`,
      "Опубликовано",
      "Запланировано",
      "Статус квоты",
      "Подробный список РК",
    ]
    const csvRows = filteredTkRows.map((tk) => [
      tk.number,
      tk.format,
      `"${tk.city}"`,
      `"${tk.address.replace(/"/g, '""')}"`,
      tk.totalDuration,
      tk.paidDuration,
      Math.max(0, tk.paidRemainingSec),
      tk.freeDuration,
      `"${tk.activeList.length} РК на ${tk.airTotalDuration} сек"`,
      `"${tk.plannedList.length} РК на ${tk.plannedDuration} сек"`,
      `"${tk.alertReason}"`,
      `"${tk.shownList
        .map((c) => `[${c._statusOnDate.toUpperCase()}] ${c.name} (${c.client}, ${c.duration}с, ${c._type})`)
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
    setOnlyOverLimit(false)
    setOnlyExpiringSoon(false)
    setIncludeBookingsInTk(false)
    setSelectedDate(new Date())
    setStatusFilter("all")
    setCampaignTypeFilter("")
    setCampaignFormatFilter("")
    setClientFilter("")
  }

  const getStatusBadge = (status: CampaignStatusLabel, startDate?: string) => {
    if (status === "опубликовано") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
          опубликовано
        </span>
      )
    }
    if (status === "запланировано") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-2xs">
          запланировано {startDate ? `(с ${formatShortDate(startDate)})` : ""}
        </span>
      )
    }
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-500/20 text-zinc-700 dark:text-zinc-300 border border-zinc-500/30">
        завершён
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-10">
      {/* Модальное окно создания Бронирования */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Бронирование эфирного времени</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 py-2">
            {/* 1. Название РК */}
            <div className="grid gap-1.5">
              <Label>
                Название РК <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Введите название рекламной кампании"
                value={bCampaignName}
                onChange={(e) => setBCampaignName(e.target.value)}
              />
            </div>

            {/* 2. Фамилия */}
            <div className="grid gap-1.5">
              <Label>
                Фамилия <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Введите вашу фамилию"
                value={bSurname}
                onChange={(e) => setBSurname(e.target.value)}
              />
            </div>

            {/* 3. Даты показа */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>
                  Дата старта показа <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !bStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bStartDate ? format(bStartDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={bStartDate}
                      onSelect={(d) => setBStartDate(d)}
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-1.5">
                <Label>
                  Дата окончания показа <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !bEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bEndDate ? format(bEndDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={bEndDate}
                      onSelect={(d) => setBEndDate(d)}
                      locale={ru}
                      disabled={bStartDate ? { before: bStartDate } : undefined}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* 4. Формат, 5. Тип, 6. Хронометраж */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>
                  Формат <span className="text-destructive">*</span>
                </Label>
                <Select value={bFormat} onValueChange={handleBFormatChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {fmt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>
                  Тип <span className="text-destructive">*</span>
                </Label>
                <Select value={bPayerType} onValueChange={setBPayerType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="платная">платная</SelectItem>
                    <SelectItem value="бесплатная">бесплатная</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>
                  Хронометраж <span className="text-destructive">*</span>
                </Label>
                <Select value={bDuration} onValueChange={setBDuration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((sec) => (
                      <SelectItem key={sec} value={String(sec)}>
                        {sec} сек
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 7. Список ТК */}
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label>
                  Список ТК ({bSelectedSet.size} выбр.){" "}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => fillBTkByFormat("ГМ")}
                    className="text-primary hover:underline font-medium"
                  >
                    Все ГМ ({TOTAL_GM_COUNT})
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={() => fillBTkByFormat("СМ")}
                    className="text-primary hover:underline font-medium"
                  >
                    Все СМ ({TOTAL_SM_COUNT})
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={() => fillBTkByFormat("ГМ+СМ")}
                    className="text-primary hover:underline font-medium"
                  >
                    ГМ+СМ ({TOTAL_TK_COUNT})
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={() => setBTkNumbers("")}
                    className="text-muted-foreground hover:underline"
                  >
                    Очистить
                  </button>
                </div>
              </div>

              <Input
                placeholder="Укажите номера ТК через запятую (например: 2, 3, 15)"
                value={bTkNumbers}
                onChange={(e) => setBTkNumbers(e.target.value)}
                className={cn(bParsedTk.unknownNumbers.length > 0 && "border-destructive")}
              />

              {/* Уведомление о чужих ТК */}
              {bParsedTk.unknownNumbers.length > 0 && (
                <div className="p-2.5 rounded-md border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-start gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <div>
                      <strong>Эти ТК к нам не относятся (отсутствуют в базе данных):</strong>{" "}
                      №{bParsedTk.unknownNumbers.join(", №")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2.5 text-xs shrink-0"
                    onClick={removeUnknownBTks}
                  >
                    Удалить лишние ТК
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Укажите номера ТК вручную или воспользуйтесь кнопками ниже
                </p>
                <button
                  type="button"
                  onClick={() => setBShowPicker((v) => !v)}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  {bShowPicker ? (
                    <>
                      Скрыть подбор ТК <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Выбрать по городам (ГМ / СМ) / адресам <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {bShowPicker && (
                <div className="border rounded-md p-2.5 bg-muted/20 space-y-2.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Быстрый выбор по городам (раздельно для ГМ и СМ):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CITIES.map((city) => {
                      const hasGm = MASTER_TK_LIST.some((t) => t.city === city && t.format === "ГМ")
                      const hasSm = MASTER_TK_LIST.some((t) => t.city === city && t.format === "СМ")
                      return (
                        <div key={city} className="inline-flex rounded border bg-background overflow-hidden text-[10px]">
                          <span className="px-1.5 py-0.5 font-semibold text-foreground bg-muted/40 border-r">
                            {city}
                          </span>
                          {hasGm && (
                            <button
                              type="button"
                              onClick={() => toggleCityFormatTks(city, "ГМ")}
                              className="px-1.5 py-0.5 hover:bg-primary/10 text-primary font-medium border-r"
                              title={`Выбрать все ГМ в г. ${city}`}
                            >
                              + ГМ
                            </button>
                          )}
                          {hasSm && (
                            <button
                              type="button"
                              onClick={() => toggleCityFormatTks(city, "СМ")}
                              className="px-1.5 py-0.5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                              title={`Выбрать все СМ в г. ${city}`}
                            >
                              + СМ
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <Input
                    placeholder="Поиск ТК по номеру или адресу..."
                    value={bPickerSearch}
                    onChange={(e) => setBPickerSearch(e.target.value)}
                    className="h-7 text-xs"
                  />

                  <div className="max-h-36 overflow-y-auto border rounded bg-background p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {bFilteredMasterList.map((tk) => (
                      <label
                        key={tk.number}
                        className="flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={bSelectedSet.has(tk.number)}
                          onChange={() => toggleBSingleTk(tk.number)}
                        />
                        <span className="font-bold">№{tk.number}</span>
                        <span className="text-[10px] px-1 rounded bg-muted">{tk.format}</span>
                        <span className="truncate text-muted-foreground" title={`${tk.city}, ${tk.address}`}>
                          {tk.city}, {tk.address}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {draftRedConflicts.length > 0 && (
              <div className="p-2.5 rounded-md border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Красное предупреждение: перегруз хронометража в {draftRedConflicts.length} ТК!
                </div>
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                  {draftRedConflicts.map((c) => (
                    <div key={c.tkNumber}>
                      • <strong>ТК №{c.tkNumber}</strong> ({c.city}) на {c.peakDate}: {c.reason} (Всего{" "}
                      <strong>{c.totalSec}/{TK_QUOTAS.TOTAL_MAX}с</strong>, Платно{" "}
                      <strong>{c.paidSec}/{TK_QUOTAS.PAID_MAX}с</strong>, Беспл. <strong>{c.freeSec}с</strong>)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draftOrangeConflicts.length > 0 && (
              <div className="p-2.5 rounded-md border border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-orange-600" />
                  Оранжевое предупреждение в {draftOrangeConflicts.length} ТК (остаток платного 10–20 сек)!
                </div>
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                  {draftOrangeConflicts.map((c) => (
                    <div key={c.tkNumber}>
                      • <strong>ТК №{c.tkNumber}</strong> ({c.city}) на {c.peakDate}: {c.reason} (Всего{" "}
                      <strong>{c.totalSec}/{TK_QUOTAS.TOTAL_MAX}с</strong>, Платно{" "}
                      <strong>{c.paidSec}/{TK_QUOTAS.PAID_MAX}с</strong>, Беспл. <strong>{c.freeSec}с</strong>)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBookingDialogOpen(false)}
              disabled={bSaving}
            >
              Отмена
            </Button>
            <Button onClick={handleSaveBooking} disabled={bSaving}>
              <CheckIcon className="w-4 h-4 mr-2" />
              {bSaving ? "Сохранение..." : "Забронировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Верхняя панель фильтров */}
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
                    {fmt === "ALL"
                      ? `Все (${TOTAL_TK_COUNT})`
                      : fmt === "ГМ"
                      ? `ГМ (${TOTAL_GM_COUNT})`
                      : `СМ (${TOTAL_SM_COUNT})`}
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

              <div className="inline-flex items-center gap-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-primary/40"
                  onClick={() => setSelectedDate((d) => subDays(d, 1))}
                  title="Предыдущий день"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
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
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-primary/40"
                  onClick={() => setSelectedDate((d) => addDays(d, 1))}
                  title="Следующий день"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Переключатель статусов (без «Опубликовано + План») */}
              <div className="inline-flex rounded border bg-muted/40 p-0.5 text-xs">
                <button
                  onClick={() => setStatusFilter("опубликовано")}
                  className={cn(
                    "px-2 py-0.5 rounded font-semibold transition-colors",
                    statusFilter === "опубликовано"
                      ? "bg-emerald-600 text-white"
                      : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                  )}
                >
                  Опубликовано ({stats.publishedCount})
                </button>
                <button
                  onClick={() => setStatusFilter("запланировано")}
                  className={cn(
                    "px-2 py-0.5 rounded font-semibold transition-colors",
                    statusFilter === "запланировано"
                      ? "bg-blue-600 text-white"
                      : "text-blue-700 dark:text-blue-400 hover:bg-blue-500/10"
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
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 px-3 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                onClick={() => setBookingDialogOpen(true)}
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                + Бронирование
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
                <button
                  onClick={() => setViewMode("bookings")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                    viewMode === "bookings"
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "text-amber-700 dark:text-amber-400 hover:text-foreground"
                  )}
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  Список бронирования ({evaluatedBookings.length})
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={handleExportTkCsv}
              >
                <Download className="w-3.5 h-3.5" />
                Excel
              </Button>

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

              {/* По умолчанию отключено */}
              <label className="flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded border bg-muted/40 text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={includeBookingsInTk}
                  onChange={(e) => setIncludeBookingsInTk(e.target.checked)}
                />
                Учитывать бронь в ТК ({activeBookingsOnDate.length})
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
                Предупреждения квот ({stats.overLimitTkCount})
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Верхняя сводка (4 карточки без «Правило квот ТК») */}
      <div className="max-w-[1920px] w-full mx-auto px-3 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-card border rounded px-3 py-1.5">
            <div className="text-[11px] text-muted-foreground">Показано ТК</div>
            <div className="text-sm font-bold">
              {stats.totalTk}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (ГМ: {stats.gmCount}, СМ: {stats.smCount})
              </span>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-1.5">
            <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
              Опубликовано на {format(selectedDate, "dd.MM.yyyy")}
            </div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              {stats.publishedCount} РК{" "}
              <span className="text-xs font-normal opacity-80">
                (в {stats.tkBroadcastingCount} ТК)
              </span>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded px-3 py-1.5">
            <div className="text-[11px] text-blue-800 dark:text-blue-300 font-medium">
              Запланировано / Бронь
            </div>
            <div className="text-sm font-bold text-blue-700 dark:text-blue-400">
              {stats.plannedCount} РК (в {stats.tkPlannedCount} ТК) •{" "}
              <button
                type="button"
                onClick={() => setViewMode("bookings")}
                className="text-amber-600 dark:text-amber-400 hover:underline"
              >
                {evaluatedBookings.length} бронь
              </button>
            </div>
          </div>

          <div
            className={cn(
              "border rounded px-3 py-1.5",
              stats.redTkCount > 0
                ? "bg-red-500/15 border-red-500 text-red-700 dark:text-red-300"
                : stats.orangeTkCount > 0
                ? "bg-orange-500/15 border-orange-500 text-orange-800 dark:text-orange-300"
                : "bg-card"
            )}
          >
            <div className="text-[11px] opacity-80">Статус хронометража ТК</div>
            <div className="text-xs font-bold flex items-center gap-2 mt-0.5">
              <span className={cn(stats.redTkCount > 0 && "text-red-600 dark:text-red-400")}>
                Красных: {stats.redTkCount}
              </span>
              <span>•</span>
              <span className={cn(stats.orangeTkCount > 0 && "text-orange-600 dark:text-orange-400")}>
                Оранжевых: {stats.orangeTkCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Основная область */}
      <div className="max-w-[1920px] w-full mx-auto px-3 mt-2 flex-1">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground bg-card border rounded text-xs">
            Загрузка расписания...
          </div>
        ) : viewMode === "bookings" ? (
          /* ВИД 3: СПИСОК БРОНИРОВАНИЯ */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b bg-amber-500/10 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-1.5">
                  <BookmarkCheck className="w-4 h-4 text-amber-600" />
                  Список бронирования (очередь по времени внесения: кто первым внёс — тот №1)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Оранжевое предупреждение — остаток платного 10–20с; Красное — остаток платного 0–5с или превышен лимит 180с
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                onClick={() => setBookingDialogOpen(true)}
              >
                <BookmarkPlus className="w-4 h-4" />
                Добавить бронь
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left border-r w-[75px]">Очередь</th>
                    <th className="px-3 py-2 text-left border-r w-[140px]">Дата внесения</th>
                    <th className="px-3 py-2 text-left border-r w-[180px]">Название РК</th>
                    <th className="px-3 py-2 text-left border-r w-[130px]">Фамилия</th>
                    <th className="px-3 py-2 text-left border-r w-[160px]">Даты показа</th>
                    <th className="px-3 py-2 text-center border-r w-[80px]">Формат</th>
                    <th className="px-3 py-2 text-center border-r w-[90px]">Тип</th>
                    <th className="px-3 py-2 text-center border-r w-[85px]">Хрон.</th>
                    <th className="px-3 py-2 text-left border-r w-[280px]">
                      Статус квоты (с учетом приоритета)
                    </th>
                    <th className="px-3 py-2 text-left border-r">Список ТК</th>
                    <th className="px-3 py-2 text-center w-[80px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluatedBookings.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-muted-foreground">
                        Список бронирования пуст. Нажмите «+ Бронирование», чтобы занять место в очереди.
                      </td>
                    </tr>
                  )}
                  {evaluatedBookings.map((b) => (
                    <tr
                      key={b.id}
                      className={cn(
                        "border-b transition-colors align-middle",
                        b._alertLevel === "red"
                          ? "bg-red-500/10 hover:bg-red-500/15"
                          : b._alertLevel === "orange"
                          ? "bg-orange-500/10 hover:bg-orange-500/15"
                          : "hover:bg-muted/20"
                      )}
                    >
                      <td className="px-3 py-2 border-r font-bold">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          №{b._rank}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDateTimeRu(b.createdAt)}
                      </td>
                      <td className="px-3 py-2 border-r font-semibold text-sm">{b.campaignName}</td>
                      <td className="px-3 py-2 border-r font-medium">{b.surname}</td>
                      <td className="px-3 py-2 border-r whitespace-nowrap font-medium">
                        {b.startDate} — {b.endDate}
                      </td>
                      <td className="px-3 py-2 border-r text-center">
                        <span className="px-2 py-0.5 rounded bg-muted font-semibold">
                          {b.format}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded font-semibold text-[11px]",
                            b._isPaid
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {b.payerType}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r text-center font-mono font-bold text-primary">
                        {b.duration} сек
                      </td>

                      <td className="px-3 py-2 border-r">
                        {b._alertLevel === "ok" ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            В квоте (Приоритет №{b._rank})
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-white font-bold text-[11px]",
                                b._alertLevel === "red" ? "bg-red-600" : "bg-orange-500"
                              )}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {b._alertLevel === "red"
                                ? `Красное пред. в ${b._conflicts.filter((c) => c.level === "red").length} ТК`
                                : `Оранжевое пред. в ${b._conflicts.length} ТК`}
                            </div>
                            <div className="text-[10px] max-h-16 overflow-y-auto space-y-0.5">
                              {b._conflicts.slice(0, 3).map((c) => (
                                <div
                                  key={c.tkNumber}
                                  className={cn(
                                    c.level === "red"
                                      ? "text-red-700 dark:text-red-300 font-medium"
                                      : "text-orange-800 dark:text-orange-300"
                                  )}
                                >
                                  ТК №{c.tkNumber} ({c.peakDate}): {c.reason}
                                </div>
                              ))}
                              {b._conflicts.length > 3 && (
                                <div>...и еще {b._conflicts.length - 3} ТК</div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 border-r">
                        <div className="font-medium text-[11px] mb-0.5">
                          Выбрано ТК: <strong>{b.shoppingCenterNumbers.length}</strong>
                        </div>
                        <div
                          className="text-[11px] text-muted-foreground max-w-[300px] truncate"
                          title={b.tkNumbersRaw}
                        >
                          {b.tkNumbersRaw}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(b.id, b.surname)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                          title="Удалить бронь"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === "list" ? (
          /* ВИД 1: КОМПАКТНЫЙ СПИСОК ТК С КНОПКОЙ «РАЗВЕРНУТЬ» */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r w-[54px]">№ ТК</th>
                    <th className="px-1.5 py-1.5 text-center border-r w-[48px]">Форм.</th>
                    <th className="px-2 py-1.5 text-left border-r w-[125px]">Город</th>
                    <th className="px-2 py-1.5 text-left border-r w-[205px]">Адрес</th>
                    <th className="px-2 py-1.5 text-center border-r w-[102px]">
                      Суммарно (≤{TK_QUOTAS.TOTAL_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[112px]">
                      Платно (≤{TK_QUOTAS.PAID_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[102px]">
                      Бесплатно (30%)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[95px]">
                      Освободится
                    </th>
                    <th className="px-2.5 py-1.5 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          Рекламные кампании на {format(selectedDate, "dd.MM.yyyy")}
                        </span>
                        {allExpandableNums.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleExpandAll}
                            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                          >
                            {areAllExpanded ? (
                              <>
                                Свернуть все <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                Развернуть все <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
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
                  {filteredTkRows.map((tk) => {
                    const isExpanded = expandedTkSet.has(tk.number)
                    return (
                      <tr
                        key={tk.number}
                        className={cn(
                          "border-b transition-colors align-middle",
                          tk.alertLevel === "red"
                            ? "bg-red-500/10 hover:bg-red-500/15"
                            : tk.alertLevel === "orange"
                            ? "bg-orange-500/10 hover:bg-orange-500/15"
                            : "hover:bg-muted/20"
                        )}
                      >
                        <td
                          className={cn(
                            "px-2 py-1 font-bold border-r whitespace-nowrap",
                            tk.alertLevel === "red" && "bg-red-600 text-white",
                            tk.alertLevel === "orange" && "bg-orange-500 text-white"
                          )}
                          title={tk.alertReason}
                        >
                          №{tk.number}
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

                        <td
                          className="px-2 py-1 text-foreground/90 border-r truncate max-w-[205px]"
                          title={tk.address}
                        >
                          {tk.address}
                        </td>

                        <td
                          className={cn(
                            "px-2 py-1 text-center border-r whitespace-nowrap font-mono font-bold",
                            tk.isOverTotal
                              ? "bg-red-600 text-white"
                              : tk.alertLevel === "red"
                              ? "text-red-700 dark:text-red-400"
                              : tk.alertLevel === "orange"
                              ? "text-orange-700 dark:text-orange-400"
                              : tk.totalDuration > 0
                              ? "text-foreground"
                              : "text-muted-foreground font-normal"
                          )}
                        >
                          <div>
                            {tk.totalDuration} / {TK_QUOTAS.TOTAL_MAX}с
                          </div>
                          {includeBookingsInTk && tk.bookedTotalDuration > 0 && (
                            <div className="text-[9px] font-normal text-amber-600 dark:text-amber-400">
                              +бронь {tk.bookedTotalDuration}с
                            </div>
                          )}
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
                          <div>
                            {tk.paidDuration} / {TK_QUOTAS.PAID_MAX}с
                          </div>
                          <div
                            className={cn(
                              "text-[9px] font-normal",
                              tk.isOverPaid
                                ? "text-white/90"
                                : tk.paidRemainingSec <= 5 && tk.freeDuration > 0
                                ? "text-red-600 dark:text-red-400 font-bold"
                                : tk.paidRemainingSec <= 20 && tk.freeDuration > 0
                                ? "text-orange-600 dark:text-orange-400 font-bold"
                                : "text-muted-foreground"
                            )}
                          >
                            своб: {Math.max(0, tk.paidRemainingSec)}с
                          </div>
                        </td>

                        <td
                          className={cn(
                            "px-2 py-1 text-center border-r whitespace-nowrap font-mono",
                            tk.freeDuration > 0 && tk.paidRemainingSec <= 5
                              ? "bg-red-600 text-white font-bold"
                              : tk.freeDuration > 0 && tk.paidRemainingSec <= 20
                              ? "bg-orange-500 text-white font-bold"
                              : tk.freeDuration > 0
                              ? "text-amber-700 dark:text-amber-400 font-semibold"
                              : "text-muted-foreground"
                          )}
                          title={tk.alertReason}
                        >
                          <div>
                            {tk.freeDuration} / {TK_QUOTAS.FREE_MAX}с
                          </div>
                          {tk.freeDuration > TK_QUOTAS.FREE_MAX && tk.paidRemainingSec > 20 && (
                            <div className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400">
                              резерв &gt;20с OK
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-1 text-center border-r whitespace-nowrap">
                          {tk.earliestEndDate ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                              title={`После ${tk.earliestEndDate} освободится ${tk.freedSeconds} сек`}
                            >
                              <Clock className="w-2.5 h-2.5" />-{tk.freedSeconds}с с{" "}
                              {formatShortDate(tk.earliestEndDate)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-2.5 py-1">
                          {!tk.hasAnyItems && tk.plannedList.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground">
                              опубликовано: 0 РК (0 сек) • запланировано: 0 РК (0 сек)
                            </span>
                          ) : (
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border",
                                      tk.activeList.length > 0
                                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-semibold"
                                        : "bg-muted/40 text-muted-foreground border-transparent"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        tk.activeList.length > 0
                                          ? "bg-emerald-500"
                                          : "bg-muted-foreground/40"
                                      )}
                                    />
                                    опубликовано: <strong>{tk.activeList.length} РК</strong> на{" "}
                                    <strong className="font-mono">{tk.airTotalDuration} сек</strong>
                                  </span>

                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border",
                                      tk.plannedList.length > 0
                                        ? "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/40 font-semibold"
                                        : "bg-muted/40 text-muted-foreground border-transparent"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        tk.plannedList.length > 0
                                          ? "bg-blue-500"
                                          : "bg-muted-foreground/40"
                                      )}
                                    />
                                    запланировано: <strong>{tk.plannedList.length} РК</strong> на{" "}
                                    <strong className="font-mono">{tk.plannedDuration} сек</strong>
                                  </span>

                                  {includeBookingsInTk && tk.bookingsInTk.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40 font-semibold">
                                      бронь: {tk.bookingsInTk.length} на {tk.bookedTotalDuration} сек
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleExpandTk(tk.number)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-background hover:bg-accent text-[11px] font-medium text-primary shrink-0 transition-colors"
                                >
                                  {isExpanded ? (
                                    <>
                                      Свернуть <ChevronUp className="w-3 h-3" />
                                    </>
                                  ) : (
                                    <>
                                      Развернуть <ChevronDown className="w-3 h-3" />
                                    </>
                                  )}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="mt-2 pt-2 border-t flex flex-wrap gap-1.5">
                                  {tk.shownList.map((camp) => {
                                    const isPub = camp._statusOnDate === "опубликовано"
                                    const isPlan = camp._statusOnDate === "запланировано"
                                    return (
                                      <div
                                        key={`c-${camp.id}`}
                                        className={cn(
                                          "inline-flex items-center gap-1.5 border rounded px-2 py-1 text-[11px] border-l-4",
                                          isPub &&
                                            "bg-emerald-500/10 border-emerald-500/30 border-l-emerald-600",
                                          isPlan &&
                                            "bg-blue-500/10 border-blue-500/30 border-l-blue-600",
                                          !isPub &&
                                            !isPlan &&
                                            "bg-zinc-500/10 border-zinc-500/30 border-l-zinc-500 opacity-75"
                                        )}
                                        title={`${camp.name} | Заказчик: ${camp.client} | Статус: ${camp._statusOnDate} | Формат: ${camp._format} | Тип: ${camp._type} | Период: ${camp.startDate} — ${camp.endDate}`}
                                      >
                                        <span className="font-semibold">{camp.name}</span>
                                        <span className="text-muted-foreground">
                                          ({camp.client})
                                        </span>
                                        <span className="font-mono font-bold text-primary">
                                          {camp.duration}с
                                        </span>
                                        <span className="text-[10px] px-1 rounded bg-background/80">
                                          {camp._format}
                                        </span>
                                        <span
                                          className={cn(
                                            "text-[10px] font-semibold",
                                            camp._isPaid
                                              ? "text-emerald-700 dark:text-emerald-400"
                                              : "text-amber-700 dark:text-amber-400"
                                          )}
                                        >
                                          {camp._type}
                                        </span>
                                        {getStatusBadge(camp._statusOnDate, camp.startDate)}
                                      </div>
                                    )
                                  })}

                                  {includeBookingsInTk &&
                                    tk.bookingsInTk.map((b) => (
                                      <div
                                        key={`b-${b.id}`}
                                        className="inline-flex items-center gap-1.5 border rounded px-2 py-1 text-[11px] border-l-4 bg-amber-500/15 border-amber-500/40 border-l-amber-600"
                                      >
                                        <span className="px-1 rounded bg-amber-600 text-white text-[10px] font-bold">
                                          бронь №{b._rank}
                                        </span>
                                        <span className="font-semibold">{b.campaignName}</span>
                                        <span className="text-muted-foreground">({b.surname})</span>
                                        <span className="font-mono font-bold">{b.duration}с</span>
                                        <span className="text-[10px] px-1 rounded bg-background/80">
                                          {b.format}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {b.payerType}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ВИД 2: МАТРИЦА С ЗАКРЕПЛЕННЫМ НИЖНИМ БЛОКОМ */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead className="bg-muted/80 sticky top-0 z-20">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-b border-r sticky left-0 z-30 bg-muted min-w-[280px]">
                      Кампания / Заказчик / Статус на {format(selectedDate, "dd.MM.yyyy")}
                    </th>
                    {filteredTkRows.map((tk) => (
                      <th
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-b border-r text-center min-w-[68px] max-w-[78px]",
                          tk.alertLevel === "red" && "bg-red-600 text-white",
                          tk.alertLevel === "orange" && "bg-orange-500 text-white"
                        )}
                        title={`ТК №${tk.number} (${tk.city}, ${tk.address}) | ${tk.alertReason}`}
                      >
                        <div className="font-bold text-[11px]">№{tk.number}</div>
                        <div
                          className={cn(
                            "text-[9px]",
                            tk.alertLevel !== "ok" ? "text-white/90" : "text-muted-foreground"
                          )}
                        >
                          {tk.format} • {tk.totalDuration}с
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedCampaigns.map((camp) => {
                    const isPub = camp._statusOnDate === "опубликовано"
                    const isPlan = camp._statusOnDate === "запланировано"
                    return (
                      <tr key={`mc-${camp.id}`} className="border-b hover:bg-muted/20">
                        <td
                          className={cn(
                            "px-2 py-1 border-r sticky left-0 z-10 bg-card border-l-4",
                            isPub && "border-l-emerald-600",
                            isPlan && "border-l-blue-600",
                            !isPub && !isPlan && "border-l-zinc-400"
                          )}
                        >
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
                                tk.alertLevel === "red" && "bg-red-500/10",
                                tk.alertLevel === "orange" && "bg-orange-500/10"
                              )}
                            >
                              {isPlaced ? (
                                <span
                                  className={cn(
                                    "inline-block px-1.5 py-0.2 rounded font-bold text-[10px]",
                                    isPlan
                                      ? "bg-blue-600 text-white"
                                      : isPub
                                      ? "bg-emerald-600 text-white"
                                      : "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400"
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
                </tbody>

                <tfoot className="sticky bottom-0 z-20 bg-muted/95 border-t-2 shadow-[0_-3px_8px_rgba(0,0,0,0.08)]">
                  <tr className="font-bold text-[11px]">
                    <td className="px-2 py-1.5 border-r sticky left-0 z-30 bg-muted">
                      Суммарно в эфире (лимит {TK_QUOTAS.TOTAL_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1.5 border-r text-center font-mono bg-muted",
                          tk.alertLevel === "red" && "bg-red-600 text-white",
                          tk.alertLevel === "orange" && "bg-orange-500 text-white"
                        )}
                      >
                        {tk.totalDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="text-[10px] bg-muted/90">
                    <td className="px-2 py-1 border-r sticky left-0 z-30 bg-muted font-medium">
                      Платно (лимит {TK_QUOTAS.PAID_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r text-center font-mono bg-muted",
                          tk.isOverPaid
                            ? "bg-red-600 text-white font-bold"
                            : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {tk.paidDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="text-[10px] bg-muted/90">
                    <td className="px-2 py-1 border-r sticky left-0 z-30 bg-muted font-medium">
                      Бесплатно (30%)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r text-center font-mono bg-muted",
                          tk.freeDuration > 0 && tk.paidRemainingSec <= 5
                            ? "bg-red-600 text-white font-bold"
                            : tk.freeDuration > 0 && tk.paidRemainingSec <= 20
                            ? "bg-orange-500 text-white font-bold"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {tk.freeDuration}с
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RebuildAdmin
