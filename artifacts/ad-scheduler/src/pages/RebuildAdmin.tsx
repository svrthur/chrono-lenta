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
  priorBookingsInTk: string[]
}

export type EvaluatedBooking = BookingRow & {
  _rank: number
  _isPaid: boolean
  _scSet: Set<string>
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

// Функция расчета приоритетов и конфликтов для очереди бронирования (по принципу FIFO)
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

    // Учитываем только те брони, которые были внесены РАНЬШЕ текущей (индексы 0 .. idx-1)
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

      if (
        maxTotal > TK_QUOTAS.TOTAL_MAX ||
        maxPaid > TK_QUOTAS.PAID_MAX ||
        maxFree > TK_QUOTAS.FREE_MAX
      ) {
        const tkInfo = MASTER_TK_LIST.find((t) => t.number === tkNum)
        conflicts.push({
          tkNumber: tkNum,
          city: tkInfo?.city || "",
          peakDate: worstDate,
          totalSec: maxTotal,
          paidSec: maxPaid,
          freeSec: maxFree,
          priorBookingsInTk: worstPriorNames,
        })
      }
    }

    evaluated.push({
      ...b,
      _rank: rank,
      _isPaid: bIsPaid,
      _scSet: bScSet,
      _hasConflict: conflicts.length > 0,
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

  // Переключатель Пункта 1: Учитывать брони в счетчиках ТК (Эфир + Бронь)
  const [includeBookingsInTk, setIncludeBookingsInTk] = useState<boolean>(true)

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

  // Пункт 2: Очередь бронирования с расчетом приоритетов и конфликтов (FIFO)
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

  // Превентивная проверка конфликтов прямо внутри модального окна «+ Бронирование»
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

  // Брони, попадающие на выбранную в календаре дату (для Пункта 1: Эфир + Бронь)
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

  // Расчет загрузки каждого ТК с учетом тумблера «Учитывать бронь в ТК (Эфир + Бронь)»
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

      const isOverTotal = totalDuration > TK_QUOTAS.TOTAL_MAX
      const isOverPaid = paidDuration > TK_QUOTAS.PAID_MAX
      const isOverFree = freeDuration > TK_QUOTAS.FREE_MAX
      const isOverLimit = isOverTotal || isOverPaid || isOverFree

      const hasAnyItems =
        shownList.length > 0 || (includeBookingsInTk && bookingsInTk.length > 0)

      return {
        ...tk,
        activeList,
        plannedList,
        shownList,
        bookingsInTk,
        airPaidDuration,
        airFreeDuration,
        bookedPaidDuration,
        bookedFreeDuration,
        bookedTotalDuration,
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
        hasAnyItems,
      }
    }).filter((tk) => {
      if (tkFormatFilter !== "ALL" && tk.format !== tkFormatFilter) return false
      if (cityFilter && tk.city !== cityFilter) return false
      if (onlyWithAds && !tk.hasAnyItems) return false
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
    activeBookingsOnDate,
    includeBookingsInTk,
  ])

  const stats = useMemo(() => {
    const visibleTkNums = new Set(filteredTkRows.map((t) => t.number))
    const inVisible = (list: typeof publishedCampaigns) =>
      list.filter((c) => Array.from(c._scNumbersSet).some((num) => visibleTkNums.has(num)))

    const pubVis = inVisible(publishedCampaigns)
    const planVis = inVisible(plannedCampaigns)
    const finVis = inVisible(finishedCampaigns)
    const conflictBookingsCount = evaluatedBookings.filter((b) => b._hasConflict).length

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
      `Бесплатно сек (лимит ${TK_QUOTAS.FREE_MAX})`,
      "Из них в брони (сек)",
      "План (сек)",
      "Ближайшее освобождение",
      "Активные РК и Брони",
    ]
    const csvRows = filteredTkRows.map((tk) => [
      tk.number,
      tk.format,
      `"${tk.city}"`,
      `"${tk.address.replace(/"/g, '""')}"`,
      tk.totalDuration,
      tk.paidDuration,
      tk.freeDuration,
      tk.bookedTotalDuration,
      tk.plannedDuration,
      tk.earliestEndDate ? `-${tk.freedSeconds}с после ${tk.earliestEndDate}` : "—",
      `"${[
        ...tk.shownList.map(
          (c) => `${c.name} (${c.client}, ${c.duration}с, ${c._type}, ${c._statusOnDate})`
        ),
        ...(includeBookingsInTk
          ? tk.bookingsInTk.map(
              (b) => `БРОНЬ №${b._rank}: ${b.surname} (${b.duration}с, ${b.payerType})`
            )
          : []),
      ]
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
    setIncludeBookingsInTk(true)
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
      {/* Модальное окно создания Бронирования */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Бронирование эфирного времени</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3.5 py-2">
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

            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label>
                  Список ТК ({bSelectedSet.size} выбр.) <span className="text-destructive">*</span>
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
              />

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  При выборе ГМ, СМ или ГМ+СМ список ТК подставляется автоматически
                </p>
                <button
                  type="button"
                  onClick={() => setBShowPicker((v) => !v)}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  {bShowPicker ? (
                    <>
                      Скрыть список ТК <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Выбрать по городам / адресам <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {bShowPicker && (
                <div className="border rounded-md p-2.5 bg-muted/20 space-y-2">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Быстрый выбор по городам:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CITIES.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => toggleBCityTks(city)}
                        className="px-2 py-0.5 text-[11px] rounded border bg-background hover:bg-primary/10 transition-colors"
                      >
                        + {city}
                      </button>
                    ))}
                  </div>

                  <Input
                    placeholder="Поиск ТК по номеру, городу или адресу..."
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

            {/* Превентивное уведомление о конфликте с эфиром или ранее внесенными бронями */}
            {draftBookingConflicts.length > 0 && (
              <div className="p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Внимание: превышение квоты (с учетом действующих РК и более ранних броней) в{" "}
                  {draftBookingConflicts.length} ТК!
                </div>
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                  {draftBookingConflicts.map((c) => (
                    <div key={c.tkNumber}>
                      • <strong>ТК №{c.tkNumber}</strong> ({c.city}) на {c.peakDate}: Суммарно{" "}
                      <strong>{c.totalSec}/{TK_QUOTAS.TOTAL_MAX}с</strong>, Платно{" "}
                      <strong>{c.paidSec}/{TK_QUOTAS.PAID_MAX}с</strong>, Беспл.{" "}
                      <strong>{c.freeSec}/{TK_QUOTAS.FREE_MAX}с</strong>
                      {c.priorBookingsInTk.length > 0 && (
                        <span> (ранее в очереди: {c.priorBookingsInTk.join(", ")})</span>
                      )}
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

              <Input
                placeholder="Поиск ролика / заказчика..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 w-[150px] text-xs px-2"
              />

              {/* Пункт 1: Переключатель учета броней в счетчиках ТК */}
              <label className="flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 font-semibold">
                <input
                  type="checkbox"
                  checked={includeBookingsInTk}
                  onChange={(e) => setIncludeBookingsInTk(e.target.checked)}
                />
                Учитывать бронь в ТК ({activeBookingsOnDate.length})
              </label>

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

      {/* Сводка */}
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
              Запланировано / Очередь брони
            </div>
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {stats.plannedCount} план •{" "}
              <button
                type="button"
                onClick={() => setViewMode("bookings")}
                className="text-amber-600 dark:text-amber-400 hover:underline"
              >
                {evaluatedBookings.length} бронь
              </button>
              {stats.conflictBookingsCount > 0 && (
                <span className="ml-1 text-xs text-red-600 font-semibold">
                  ({stats.conflictBookingsCount} конфл.)
                </span>
              )}
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
            <div className="text-[11px] opacity-80">
              Превышение лимитов {includeBookingsInTk ? "(Эфир + Бронь)" : "(Только эфир)"}
            </div>
            <div className="text-sm font-bold flex items-center gap-1">
              {stats.overLimitTkCount > 0 && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {stats.overLimitTkCount} ТК
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
          /* ВИД 3: СПИСОК БРОНИРОВАНИЯ С РАСЧЕТОМ ПРИОРИТЕТА И КОНФЛИКТОВ (FIFO) */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b bg-amber-500/10 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-1.5">
                  <BookmarkCheck className="w-4 h-4 text-amber-600" />
                  Список бронирования (очередь по времени внесения + контроль квот по приоритету)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Кто первым внёс данные, тот стоит в начале списка (№1) и имеет приоритет квоты 180с (125с / 55с) перед следующими бронями
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
                    <th className="px-3 py-2 text-left border-r w-[80px]">Очередь</th>
                    <th className="px-3 py-2 text-left border-r w-[150px]">Дата внесения</th>
                    <th className="px-3 py-2 text-left border-r w-[150px]">Фамилия</th>
                    <th className="px-3 py-2 text-left border-r w-[170px]">Даты показа</th>
                    <th className="px-3 py-2 text-center border-r w-[85px]">Формат</th>
                    <th className="px-3 py-2 text-center border-r w-[100px]">Тип</th>
                    <th className="px-3 py-2 text-center border-r w-[95px]">Хронометраж</th>
                    <th className="px-3 py-2 text-left border-r w-[280px]">
                      Статус квоты (с учетом приоритета очереди)
                    </th>
                    <th className="px-3 py-2 text-left border-r">Список ТК</th>
                    <th className="px-3 py-2 text-center w-[85px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluatedBookings.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        Список бронирования пуст. Нажмите «+ Бронирование», чтобы занять место в очереди.
                      </td>
                    </tr>
                  )}
                  {evaluatedBookings.map((b) => (
                    <tr
                      key={b.id}
                      className={cn(
                        "border-b transition-colors align-middle",
                        b._hasConflict ? "bg-red-500/10 hover:bg-red-500/15" : "hover:bg-muted/20"
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
                      <td className="px-3 py-2 border-r font-semibold text-sm">{b.surname}</td>
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

                      {/* Пункт 2: Статус квоты с учетом приоритета очереди */}
                      <td className="px-3 py-2 border-r">
                        {!b._hasConflict ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            В квоте (Приоритет №{b._rank})
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Перегруз в {b._conflicts.length} ТК
                            </div>
                            <div className="text-[10px] text-red-700 dark:text-red-300 max-h-16 overflow-y-auto space-y-0.5">
                              {b._conflicts.slice(0, 4).map((c) => (
                                <div key={c.tkNumber}>
                                  ТК №{c.tkNumber} ({c.peakDate}): {c.totalSec}/{TK_QUOTAS.TOTAL_MAX}с (пл.{" "}
                                  {c.paidSec}/{TK_QUOTAS.PAID_MAX}с, б/п {c.freeSec}/{TK_QUOTAS.FREE_MAX}с)
                                  {c.priorBookingsInTk.length > 0 && (
                                    <span> • впереди: {c.priorBookingsInTk.join(", ")}</span>
                                  )}
                                </div>
                              ))}
                              {b._conflicts.length > 4 && (
                                <div>...и еще {b._conflicts.length - 4} ТК</div>
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
                          className="text-[11px] text-muted-foreground max-w-[340px] truncate"
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
          /* ВИД 1: СПИСОК ТК С УЧЕТОМ БРОНЕЙ */
          <div className="bg-card border rounded shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r w-[54px]">№ ТК</th>
                    <th className="px-1.5 py-1.5 text-center border-r w-[48px]">Форм.</th>
                    <th className="px-2 py-1.5 text-left border-r w-[130px]">Город</th>
                    <th className="px-2 py-1.5 text-left border-r w-[210px]">Адрес</th>
                    <th className="px-2 py-1.5 text-center border-r w-[104px]">
                      Суммарно (≤{TK_QUOTAS.TOTAL_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[104px]">
                      Платно 70% (≤{TK_QUOTAS.PAID_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[104px]">
                      Беспл. 30% (≤{TK_QUOTAS.FREE_MAX}с)
                    </th>
                    <th className="px-2 py-1.5 text-center border-r w-[115px]">
                      Освободится / План
                    </th>
                    <th className="px-2 py-1.5 text-left">
                      Рекламные кампании {includeBookingsInTk ? "и активные брони " : ""}на{" "}
                      {format(selectedDate, "dd.MM.yyyy")}
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

                      {/* Суммарно */}
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
                        <div>
                          {tk.totalDuration} / {TK_QUOTAS.TOTAL_MAX}с
                        </div>
                        {includeBookingsInTk && tk.bookedTotalDuration > 0 && (
                          <div
                            className={cn(
                              "text-[9px] font-normal",
                              tk.isOverTotal ? "text-white/90" : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            в т.ч. бронь {tk.bookedTotalDuration}с
                          </div>
                        )}
                      </td>

                      {/* Платно */}
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
                        {includeBookingsInTk && tk.bookedPaidDuration > 0 && (
                          <div
                            className={cn(
                              "text-[9px] font-normal",
                              tk.isOverPaid ? "text-white/90" : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            бронь +{tk.bookedPaidDuration}с
                          </div>
                        )}
                      </td>

                      {/* Бесплатно */}
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
                        <div>
                          {tk.freeDuration} / {TK_QUOTAS.FREE_MAX}с
                        </div>
                        {includeBookingsInTk && tk.bookedFreeDuration > 0 && (
                          <div
                            className={cn(
                              "text-[9px] font-normal",
                              tk.isOverFree ? "text-white/90" : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            бронь +{tk.bookedFreeDuration}с
                          </div>
                        )}
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
                        {!tk.hasAnyItems ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tk.shownList.map((camp) => (
                              <div
                                key={`c-${camp.id}`}
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

                            {/* Плашки броней на выбранную дату в этом ТК */}
                            {includeBookingsInTk &&
                              tk.bookingsInTk.map((b) => (
                                <div
                                  key={`b-${b.id}`}
                                  className={cn(
                                    "inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px]",
                                    b._hasConflict
                                      ? "bg-red-500/15 border-red-500/40"
                                      : "bg-amber-500/15 border-amber-500/40"
                                  )}
                                  title={`Бронь №${b._rank}: ${b.surname} | Период: ${b.startDate} — ${b.endDate} | Формат: ${b.format} | Тип: ${b.payerType}`}
                                >
                                  <span className="px-1 rounded bg-amber-600 text-white text-[10px] font-bold">
                                    бронь №{b._rank}
                                  </span>
                                  <span className="font-semibold">{b.surname}</span>
                                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                                    {b.duration}с
                                  </span>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ВИД 2: МАТРИЦА */
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
                  {displayedCampaigns.map((camp) => (
                    <tr key={`mc-${camp.id}`} className="border-b hover:bg-muted/20">
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

                  {/* Строки броней в Матрице, если включен учет брони */}
                  {includeBookingsInTk &&
                    activeBookingsOnDate.map((b) => (
                      <tr key={`mb-${b.id}`} className="border-b bg-amber-500/5 hover:bg-amber-500/10">
                        <td className="px-2 py-1 border-r sticky left-0 z-10 bg-card">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs truncate">
                              Бронь: {b.surname}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-600 text-white">
                              бронь №{b._rank}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <span className="font-mono font-semibold">{b.duration}с</span>
                            <span>•</span>
                            <span>{b.format}</span>
                            <span>•</span>
                            <span>{b.payerType}</span>
                          </div>
                        </td>
                        {filteredTkRows.map((tk) => {
                          const isPlaced = b._scSet.has(tk.number)
                          return (
                            <td
                              key={tk.number}
                              className={cn(
                                "border-r px-0.5 py-1 text-center",
                                tk.isOverLimit && "bg-red-500/10"
                              )}
                            >
                              {isPlaced ? (
                                <span className="inline-block px-1 py-0.2 rounded font-bold text-[10px] bg-amber-600 text-white">
                                  {b.duration}с
                                </span>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    ))}

                  <tr className="bg-muted/40 font-bold border-t-2 text-[11px]">
                    <td className="px-2 py-1 border-r sticky left-0 z-10 bg-muted">
                      Суммарно {includeBookingsInTk ? "(Эфир + Бронь)" : "в эфире"} (лимит{" "}
                      {TK_QUOTAS.TOTAL_MAX}с)
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
