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
  Sun,
  Moon,
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
import { cn } from "@/lib/utils"

const LOCAL_DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
const LOCAL_FORMAT_OPTIONS = ["ГМ", "СМ", "ГМ+СМ", "част.ГМ", "част.СМ"] as const
const MASTER_TK_SET = new Set(MASTER_TK_LIST.map((t) => t.number))

export type QuotaAlertLevel = "ok" | "orange" | "red"

export function parseAndValidateTkNumbers(rawInput: string) {
  const tokens = rawInput
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const uniqueTokens = Array.from(new Set(tokens))
  const validNumbers = uniqueTokens.filter((n) => MASTER_TK_SET.has(n))
  const unknownNumbers = uniqueTokens.filter((n) => !MASTER_TK_SET.has(n))
  return { allEntered: uniqueTokens, validNumbers, unknownNumbers }
}

export function evaluateTkQuota(paidSec: number, freeSec: number) {
  const totalSec = paidSec + freeSec
  const paidRemainingSec = Math.min(
    TK_QUOTAS.PAID_MAX - paidSec,
    TK_QUOTAS.TOTAL_MAX - totalSec
  )
  const isOverTotal = totalSec > TK_QUOTAS.TOTAL_MAX
  const isOverPaid = paidSec > TK_QUOTAS.PAID_MAX

  if (isOverTotal) {
    return {
      level: "red" as QuotaAlertLevel,
      totalSec,
      paidSec,
      freeSec,
      paidRemainingSec,
      isOverTotal,
      isOverPaid,
      reason: `Превышен суммарный лимит 180с (${totalSec}с)`,
    }
  }

  if (isOverPaid) {
    return {
      level: "red" as QuotaAlertLevel,
      totalSec,
      paidSec,
      freeSec,
      paidRemainingSec,
      isOverTotal,
      isOverPaid,
      reason: `Превышен платный лимит 125с (${paidSec}с)`,
    }
  }

  if (freeSec > 0) {
    if (paidRemainingSec <= 5) {
      return {
        level: "red" as QuotaAlertLevel,
        totalSec,
        paidSec,
        freeSec,
        paidRemainingSec,
        isOverTotal,
        isOverPaid,
        reason: `В платном хронометраже осталось ${Math.max(0, paidRemainingSec)}с (0–5с)`,
      }
    }
    if (paidRemainingSec >= 10 && paidRemainingSec <= 20) {
      return {
        level: "orange" as QuotaAlertLevel,
        totalSec,
        paidSec,
        freeSec,
        paidRemainingSec,
        isOverTotal,
        isOverPaid,
        reason: `В платном хронометраже осталось ${paidRemainingSec}с (10–20с)`,
      }
    }
  }

  return {
    level: "ok" as QuotaAlertLevel,
    totalSec,
    paidSec,
    freeSec,
    paidRemainingSec,
    isOverTotal,
    isOverPaid,
    reason: "В норме",
  }
}

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
  campaignName?: string
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
      campaignName: b.campaignName || b.surname,
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

export function highlightActiveNavButton(activeTab: "colleagues" | "admin") {
  if (typeof document === "undefined") return
  const header = document.querySelector("header")
  if (!header) return
  const elements = header.querySelectorAll("a, button")
  elements.forEach((el) => {
    const text = (el.textContent || "").toLowerCase()
    const isColleaguesBtn = text.includes("экраны тк") || text.includes("для коллег")
    const isAdminBtn = text.includes("админ") && text.includes("загрузка")

    if (!isColleaguesBtn && !isAdminBtn) return

    const isActive =
      (activeTab === "colleagues" && isColleaguesBtn) ||
      (activeTab === "admin" && isAdminBtn)

    const htmlEl = el as HTMLElement
    htmlEl.style.borderRadius = "9999px"
    htmlEl.style.padding = "5px 14px"
    htmlEl.style.transition = "all 0.2s ease"

    if (isActive) {
      htmlEl.style.backgroundColor = "#007aff"
      htmlEl.style.color = "#ffffff"
      htmlEl.style.fontWeight = "700"
      htmlEl.style.boxShadow = "0 4px 12px rgba(0, 122, 255, 0.35)"
      htmlEl.style.border = "1px solid rgba(255, 255, 255, 0.35)"
    } else {
      htmlEl.style.backgroundColor = "rgba(120, 120, 128, 0.12)"
      htmlEl.style.color = ""
      htmlEl.style.fontWeight = "500"
      htmlEl.style.boxShadow = "none"
      htmlEl.style.border = "1px solid transparent"
    }
  })
}

export function RebuildAdmin() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    highlightActiveNavButton("colleagues")
  }, [])

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const saved = localStorage.getItem("chrono-theme")
    if (saved === "dark") return true
    if (saved === "light") return false
    return document.documentElement.classList.contains("dark")
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add("dark")
      localStorage.setItem("chrono-theme", "dark")
    } else {
      root.classList.remove("dark")
      localStorage.setItem("chrono-theme", "light")
    }
  }, [isDark])

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

  const [includeBookingsInTk, setIncludeBookingsInTk] = useState<boolean>(false)
  const [expandedTkSet, setExpandedTkSet] = useState<Set<string>>(new Set())

  const toggleExpandTk = (tkNum: string) => {
    setExpandedTkSet((prev) => {
      const next = new Set(prev)
      if (next.has(tkNum)) next.delete(tkNum)
      else next.add(tkNum)
      return next
    })
  }

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

  const [tkFormatFilter, setTkFormatFilter] = useState<"ALL" | "ГМ" | "СМ">("ALL")
  const [cityFilter, setCityFilter] = useState<string>("")
  const [onlyOverLimit, setOnlyOverLimit] = useState<boolean>(false)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>("")
  const [campaignFormatFilter, setCampaignFormatFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")

  const dateIso = format(selectedDate, "yyyy-MM-dd")

  const evaluatedBookings = useMemo(
    () => evaluateBookingsQueue(rawBookings, rawCampaigns),
    [rawBookings, rawCampaigns]
  )

  const bParsedTk = useMemo(() => parseAndValidateTkNumbers(bTkNumbers), [bTkNumbers])
  const bSelectedSet = useMemo(() => new Set(bParsedTk.validNumbers), [bParsedTk.validNumbers])

  const removeUnknownBTks = () => {
    setBTkNumbers(bParsedTk.validNumbers.join(", "))
  }

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

      return {
        ...c,
        _isPaid: Boolean(isPaid),
        _type: typeLabel,
        _format: formatLabel,
        _scNumbersSet: scNumbersSet,
        _statusOnDate: statusOnDate,
      }
    })
  }, [rawCampaigns, dateIso])

  const allClients = useMemo(
    () => Array.from(new Set(enrichedCampaigns.map((c) => c.client))).filter(Boolean).sort(),
    [enrichedCampaigns]
  )

  const allPublishedOnDate = useMemo(
    () =>
      enrichedCampaigns
        .filter((c) => c._statusOnDate === "опубликовано")
        .sort((a, b) => a.client.localeCompare(b.client, "ru")),
    [enrichedCampaigns]
  )
  const allPlannedOnDate = useMemo(
    () =>
      enrichedCampaigns
        .filter((c) => c._statusOnDate === "запланировано")
        .sort((a, b) => a.client.localeCompare(b.client, "ru")),
    [enrichedCampaigns]
  )

  const allBookingsOnDate = useMemo(
    () => evaluatedBookings.filter((b) => b.startDate <= dateIso && b.endDate >= dateIso),
    [evaluatedBookings, dateIso]
  )

  const hasCampaignFilter = Boolean(campaignTypeFilter || campaignFormatFilter || clientFilter)

  const baseFilteredCampaigns = useMemo(() => {
    const list = enrichedCampaigns.filter((c) => {
      if (campaignTypeFilter && c._type !== campaignTypeFilter) return false
      if (campaignFormatFilter && c._format !== campaignFormatFilter) return false
      if (clientFilter && c.client !== clientFilter) return false
      return true
    })

    list.sort((a, b) => a.client.localeCompare(b.client, "ru"))
    return list
  }, [enrichedCampaigns, campaignTypeFilter, campaignFormatFilter, clientFilter])

  const publishedCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._statusOnDate === "опубликовано"),
    [baseFilteredCampaigns]
  )
  const plannedCampaigns = useMemo(
    () => baseFilteredCampaigns.filter((c) => c._statusOnDate === "запланировано"),
    [baseFilteredCampaigns]
  )

  const displayedCampaigns = useMemo(
    () => [...publishedCampaigns, ...plannedCampaigns],
    [publishedCampaigns, plannedCampaigns]
  )

  const filteredTkRows = useMemo(() => {
    return MASTER_TK_LIST.map((tk) => {
      const activeList = allPublishedOnDate.filter((c) => c._scNumbersSet.has(tk.number))
      const plannedList = allPlannedOnDate.filter((c) => c._scNumbersSet.has(tk.number))
      const shownList = displayedCampaigns.filter((c) => c._scNumbersSet.has(tk.number))
      const bookingsInTk = allBookingsOnDate.filter((b) => b._scSet.has(tk.number))

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
      if (hasCampaignFilter && tk.shownList.length === 0) return false
      return true
    })
  }, [
    tkFormatFilter,
    cityFilter,
    onlyOverLimit,
    hasCampaignFilter,
    allPublishedOnDate,
    allPlannedOnDate,
    displayedCampaigns,
    allBookingsOnDate,
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
      publishedCount: pubVis.length,
      plannedCount: planVis.length,
      conflictBookingsCount,
    }
  }, [filteredTkRows, publishedCampaigns, plannedCampaigns, evaluatedBookings])

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
    setIncludeBookingsInTk(false)
    setSelectedDate(new Date())
    setCampaignTypeFilter("")
    setCampaignFormatFilter("")
    setClientFilter("")
  }

  const getStatusBadge = (status: CampaignStatusLabel, startDate?: string) => {
    if (status === "опубликовано") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          опубликовано
        </span>
      )
    }
    if (status === "запланировано") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
          запланировано {startDate ? `(с ${formatShortDate(startDate)})` : ""}
        </span>
      )
    }
    return (
      <span className="inline-block px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-zinc-500/15 text-zinc-500 border border-zinc-500/20">
        завершён
      </span>
    )
  }

  return (
    <div className="h-[calc(100vh-49px)] overflow-hidden apple-spatial-bg flex flex-col text-[10.5px]">
      {/* Модальное окно бронирования */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto glass-panel rounded-3xl border-white/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight">
              Бронирование эфирного времени
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2.5 py-1">
            <div className="grid gap-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Название РК <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Введите название рекламной кампании"
                value={bCampaignName}
                onChange={(e) => setBCampaignName(e.target.value)}
                className="h-7 text-[11px] rounded-xl glass-pill"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-[10.5px] font-medium text-muted-foreground">
                Фамилия <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Введите вашу фамилию"
                value={bSurname}
                onChange={(e) => setBSurname(e.target.value)}
                className="h-7 text-[11px] rounded-xl glass-pill"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Дата старта показа <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-7 text-[11px] justify-start text-left font-normal rounded-xl glass-pill",
                        !bStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1.5 h-3 w-3 text-primary" />
                      {bStartDate ? format(bStartDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl glass-panel shadow-xl" align="start">
                    <Calendar
                      mode="single"
                      selected={bStartDate}
                      onSelect={(d) => setBStartDate(d)}
                      locale={ru}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Дата окончания показа <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-7 text-[11px] justify-start text-left font-normal rounded-xl glass-pill",
                        !bEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1.5 h-3 w-3 text-primary" />
                      {bEndDate ? format(bEndDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl glass-panel shadow-xl" align="start">
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

            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Формат <span className="text-destructive">*</span>
                </Label>
                <Select value={bFormat} onValueChange={handleBFormatChange}>
                  <SelectTrigger className="h-7 text-[11px] rounded-xl glass-pill">
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl glass-panel">
                    {LOCAL_FORMAT_OPTIONS.map((fmt) => (
                      <SelectItem key={fmt} value={fmt} className="text-[11px]">
                        {fmt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Тип <span className="text-destructive">*</span>
                </Label>
                <Select value={bPayerType} onValueChange={setBPayerType}>
                  <SelectTrigger className="h-7 text-[11px] rounded-xl glass-pill">
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl glass-panel">
                    <SelectItem value="платная" className="text-[11px]">платная</SelectItem>
                    <SelectItem value="бесплатная" className="text-[11px]">бесплатная</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Хронометраж <span className="text-destructive">*</span>
                </Label>
                <Select value={bDuration} onValueChange={setBDuration}>
                  <SelectTrigger className="h-7 text-[11px] rounded-xl glass-pill">
                    <SelectValue placeholder="Выбрать" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl glass-panel">
                    {LOCAL_DURATION_OPTIONS.map((sec) => (
                      <SelectItem key={sec} value={String(sec)} className="text-[11px]">
                        {sec} сек
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Label className="text-[10.5px] font-medium text-muted-foreground">
                  Список ТК ({bSelectedSet.size} выбр.) <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-1.5 text-[10.5px]">
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
                placeholder="Номера ТК через запятую (например: 2, 3, 15)"
                value={bTkNumbers}
                onChange={(e) => setBTkNumbers(e.target.value)}
                className={cn(
                  "h-7 text-[11px] rounded-xl glass-pill",
                  bParsedTk.unknownNumbers.length > 0 && "border-destructive"
                )}
              />

              {bParsedTk.unknownNumbers.length > 0 && (
                <div className="p-2 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-[10.5px] flex items-center justify-between gap-2">
                  <div className="flex items-start gap-1.5">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <strong>Чужие ТК (нет в базе):</strong> №{bParsedTk.unknownNumbers.join(", №")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-[10px] rounded-lg"
                    onClick={removeUnknownBTks}
                  >
                    Удалить
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <p className="text-[9.5px] text-muted-foreground">
                  Укажите номера вручную или выберите ниже
                </p>
                <button
                  type="button"
                  onClick={() => setBShowPicker((v) => !v)}
                  className="text-[10.5px] text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  {bShowPicker ? (
                    <>
                      Скрыть подбор <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Выбрать по городам / адресам <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>

              {bShowPicker && (
                <div className="rounded-2xl p-2 glass-pill space-y-1.5">
                  <div className="text-[9.5px] font-semibold text-muted-foreground">
                    Быстрый выбор по городам (ГМ / СМ):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CITIES.map((city) => {
                      const hasGm = MASTER_TK_LIST.some((t) => t.city === city && t.format === "ГМ")
                      const hasSm = MASTER_TK_LIST.some((t) => t.city === city && t.format === "СМ")
                      return (
                        <div
                          key={city}
                          className="inline-flex rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 overflow-hidden text-[9.5px]"
                        >
                          <span className="px-1.5 py-0.5 font-semibold text-foreground bg-black/[0.04] dark:bg-white/[0.05] border-r border-black/10 dark:border-white/10">
                            {city}
                          </span>
                          {hasGm && (
                            <button
                              type="button"
                              onClick={() => toggleCityFormatTks(city, "ГМ")}
                              className="px-1.5 py-0.5 hover:bg-primary/15 text-primary font-medium border-r border-black/10 dark:border-white/10"
                            >
                              + ГМ
                            </button>
                          )}
                          {hasSm && (
                            <button
                              type="button"
                              onClick={() => toggleCityFormatTks(city, "СМ")}
                              className="px-1.5 py-0.5 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                            >
                              + СМ
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <Input
                    placeholder="Поиск по номеру или адресу..."
                    value={bPickerSearch}
                    onChange={(e) => setBPickerSearch(e.target.value)}
                    className="h-6 text-[10.5px] rounded-xl bg-white/50 dark:bg-black/30"
                  />

                  <div className="max-h-28 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 bg-white/40 dark:bg-black/25 p-1 grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                    {bFilteredMasterList.map((tk) => (
                      <label
                        key={tk.number}
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={bSelectedSet.has(tk.number)}
                          onChange={() => toggleBSingleTk(tk.number)}
                          className="rounded"
                        />
                        <span className="font-bold">№{tk.number}</span>
                        <span className="text-[9px] px-1 rounded bg-black/[0.06] dark:bg-white/[0.1]">
                          {tk.format}
                        </span>
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
              <div className="p-2 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-[10.5px] space-y-0.5">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  Критический перегруз в {draftRedConflicts.length} ТК!
                </div>
                <div className="max-h-16 overflow-y-auto space-y-0.5 text-[10px]">
                  {draftRedConflicts.map((c) => (
                    <div key={c.tkNumber}>
                      • <strong>ТК №{c.tkNumber}</strong> ({c.city}) на {c.peakDate}: {c.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draftOrangeConflicts.length > 0 && (
              <div className="p-2 rounded-2xl border border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[10.5px] space-y-0.5">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-orange-500" />
                  Оранжевое предупреждение в {draftOrangeConflicts.length} ТК (остаток 10–20с)!
                </div>
                <div className="max-h-16 overflow-y-auto space-y-0.5 text-[10px]">
                  {draftOrangeConflicts.map((c) => (
                    <div key={c.tkNumber}>
                      • <strong>ТК №{c.tkNumber}</strong> ({c.city}) на {c.peakDate}: {c.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookingDialogOpen(false)}
              disabled={bSaving}
              className="rounded-full h-7 px-3.5 text-[11px] glass-pill"
            >
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleSaveBooking}
              disabled={bSaving}
              className="rounded-full h-7 px-3.5 text-[11px] shadow-md shadow-primary/25"
            >
              <CheckIcon className="w-3 h-3 mr-1" />
              {bSaving ? "Сохранение..." : "Забронировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ЗАКРЕПЛЕННЫЙ ВЕРХНИЙ БЛОК ФИЛЬТРОВ И СВОДКИ */}
      <div className="glass-header shrink-0 z-40">
        <div className="max-w-[1920px] mx-auto px-3 py-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Кнопки фильтрации Все / ГМ / СМ */}
              <div className="inline-flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-full border border-black/10 dark:border-white/10">
                {(["ALL", "ГМ", "СМ"] as const).map((fmt) => {
                  const isActive = tkFormatFilter === fmt
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setTkFormatFilter(fmt)}
                      style={
                        isActive
                          ? {
                              backgroundColor: "#007aff",
                              color: "#ffffff",
                              boxShadow: "0 2px 8px rgba(0, 122, 255, 0.35)",
                            }
                          : undefined
                      }
                      className={cn(
                        "px-2.5 py-0.5 text-[10.5px] rounded-full transition-all",
                        isActive
                          ? "font-bold text-white"
                          : "font-medium text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {fmt === "ALL"
                        ? `Все (${TOTAL_TK_COUNT})`
                        : fmt === "ГМ"
                        ? `ГМ (${TOTAL_GM_COUNT})`
                        : `СМ (${TOTAL_SM_COUNT})`}
                    </button>
                  )
                })}
              </div>

              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="glass-pill rounded-full px-2.5 py-0 text-[10.5px] font-medium h-6 focus:outline-none"
              >
                <option value="">Все города ({CITIES.length})</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

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

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-6 px-3 text-[10.5px] gap-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full shadow-sm"
                onClick={() => setBookingDialogOpen(true)}
              >
                <BookmarkPlus className="w-3 h-3" />
                + Бронирование
              </Button>

              {/* ОТДЕЛЬНЫЕ ВИЗУАЛЬНО ВЫДЕЛЕННЫЕ КНОПКИ РЕЖИМОВ: Список ТК | Матрица | Брони */}
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  style={
                    viewMode === "list"
                      ? {
                          backgroundColor: "#007aff",
                          color: "#ffffff",
                          borderColor: "#0062cc",
                          boxShadow: "0 3px 10px rgba(0, 122, 255, 0.38)",
                        }
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-1 h-6 px-3 text-[10.5px] rounded-full border transition-all",
                    viewMode === "list"
                      ? "font-bold text-white"
                      : "glass-pill font-medium text-foreground/80 hover:text-foreground"
                  )}
                >
                  <ListFilter className="w-3 h-3" />
                  Список ТК
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("matrix")}
                  style={
                    viewMode === "matrix"
                      ? {
                          backgroundColor: "#007aff",
                          color: "#ffffff",
                          borderColor: "#0062cc",
                          boxShadow: "0 3px 10px rgba(0, 122, 255, 0.38)",
                        }
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-1 h-6 px-3 text-[10.5px] rounded-full border transition-all",
                    viewMode === "matrix"
                      ? "font-bold text-white"
                      : "glass-pill font-medium text-foreground/80 hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3 h-3" />
                  Матрица
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("bookings")}
                  style={
                    viewMode === "bookings"
                      ? {
                          backgroundColor: "#d97706",
                          color: "#ffffff",
                          borderColor: "#b45309",
                          boxShadow: "0 3px 10px rgba(217, 119, 6, 0.4)",
                        }
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-1 h-6 px-3 text-[10.5px] rounded-full border transition-all",
                    viewMode === "bookings"
                      ? "font-bold text-white"
                      : "glass-pill font-semibold text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
                  )}
                >
                  <BookmarkCheck className="w-3 h-3" />
                  Брони ({evaluatedBookings.length})
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10.5px] gap-1 rounded-full glass-pill"
                onClick={handleExportTkCsv}
              >
                <Download className="w-2.5 h-2.5" />
                Excel
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDark((prev) => !prev)}
                className="h-6 px-2.5 text-[10.5px] gap-1 rounded-full glass-pill font-medium"
                title="Переключить режим День / Ночь"
              >
                {isDark ? (
                  <>
                    <Sun className="w-3 h-3 text-amber-400" />
                    День
                  </>
                ) : (
                  <>
                    <Moon className="w-3 h-3 text-indigo-600" />
                    Ночь
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10.5px] rounded-full text-muted-foreground hover:text-foreground"
                onClick={resetFilters}
              >
                <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                Сброс
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-black/[0.05] dark:border-white/[0.07] text-[10px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Тип:</span>
                <select
                  value={campaignTypeFilter}
                  onChange={(e) => setCampaignTypeFilter(e.target.value)}
                  className="glass-pill rounded-full px-2 py-0 h-5 text-[10px] font-medium focus:outline-none"
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
                  className="glass-pill rounded-full px-2 py-0 h-5 text-[10px] font-medium focus:outline-none"
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
                  className="glass-pill rounded-full px-2 py-0 h-5 text-[10px] font-medium max-w-[140px] focus:outline-none"
                >
                  <option value="">Все</option>
                  {allClients.map((cl) => (
                    <option key={cl} value={cl}>
                      {cl}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1 cursor-pointer select-none px-2 py-0 rounded-full h-5 glass-pill text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={includeBookingsInTk}
                  onChange={(e) => setIncludeBookingsInTk(e.target.checked)}
                  className="rounded scale-90"
                />
                Учитывать бронь ({allBookingsOnDate.length})
              </label>

              <label className="flex items-center gap-1 cursor-pointer select-none px-2 py-0 rounded-full h-5 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                <input
                  type="checkbox"
                  checked={onlyOverLimit}
                  onChange={(e) => setOnlyOverLimit(e.target.checked)}
                  className="rounded scale-90"
                />
                Предупреждения квот ({stats.overLimitTkCount})
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="glass-pill rounded-full px-2.5 py-0.5 flex items-center gap-1">
                <span className="text-muted-foreground">ТК:</span>
                <strong>{stats.totalTk}</strong>
                <span className="text-muted-foreground text-[9.5px]">
                  (ГМ: {stats.gmCount}, СМ: {stats.smCount})
                </span>
              </div>

              <div className="rounded-full px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <span>В эфире:</span>
                <strong>{stats.publishedCount} РК</strong>
                <span className="opacity-75 text-[9.5px]">({stats.tkBroadcastingCount} ТК)</span>
              </div>

              <div className="rounded-full px-2.5 py-0.5 bg-blue-500/15 border border-blue-500/30 text-blue-800 dark:text-blue-300 flex items-center gap-1">
                <span>План:</span>
                <strong>{stats.plannedCount} РК</strong>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setViewMode("bookings")}
                  className="text-amber-600 dark:text-amber-400 font-bold hover:underline"
                >
                  {evaluatedBookings.length} бронь
                </button>
              </div>

              <div
                className={cn(
                  "rounded-full px-2.5 py-0.5 flex items-center gap-1.5 font-semibold",
                  stats.redTkCount > 0
                    ? "bg-red-500/15 border border-red-500/40 text-red-700 dark:text-red-300"
                    : stats.orangeTkCount > 0
                    ? "bg-orange-500/15 border border-orange-500/40 text-orange-800 dark:text-orange-300"
                    : "glass-pill text-muted-foreground"
                )}
              >
                <span className={cn(stats.redTkCount > 0 && "text-red-600 dark:text-red-400 font-bold")}>
                  Красных: {stats.redTkCount}
                </span>
                <span>•</span>
                <span className={cn(stats.orangeTkCount > 0 && "text-orange-600 dark:text-orange-400 font-bold")}>
                  Оранж: {stats.orangeTkCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ПРОКРУЧИВАЕМОЕ ОКНО С ДАННЫМИ */}
      <div className="max-w-[1920px] w-full mx-auto px-3 py-2 flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground glass-panel rounded-2xl text-xs">
            Загрузка расписания...
          </div>
        ) : viewMode === "bookings" ? (
          <div className="glass-panel rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-3.5 py-2 border-b border-black/[0.06] dark:border-white/[0.08] bg-amber-500/10 shrink-0 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                Список бронирования (очередь по времени внесения: кто первым внёс — тот №1)
              </h2>
              <Button
                size="sm"
                className="h-6 text-[10.5px] bg-amber-500 hover:bg-amber-600 text-white gap-1 rounded-full shadow-2xs"
                onClick={() => setBookingDialogOpen(true)}
              >
                <BookmarkPlus className="w-3 h-3" />
                Добавить бронь
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10.5px] border-collapse">
                <thead className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[62px]">Очередь</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[125px]">Дата внесения</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[160px]">Название РК</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[115px]">Фамилия</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[135px]">Даты показа</th>
                    <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[65px]">Формат</th>
                    <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[80px]">Тип</th>
                    <th className="px-2 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[70px]">Хрон.</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[240px]">
                      Статус квоты (с учетом приоритета)
                    </th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06]">Список ТК</th>
                    <th className="px-2 py-1.5 text-center w-[70px]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluatedBookings.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-muted-foreground">
                        Список бронирования пуст. Нажмите «+ Бронирование», чтобы занять место в очереди.
                      </td>
                    </tr>
                  )}
                  {evaluatedBookings.map((b) => (
                    <tr
                      key={b.id}
                      className={cn(
                        "border-b border-black/[0.05] dark:border-white/[0.06] transition-colors align-middle",
                        b._alertLevel === "red"
                          ? "bg-red-500/10 hover:bg-red-500/15"
                          : b._alertLevel === "orange"
                          ? "bg-orange-500/10 hover:bg-orange-500/15"
                          : "hover:bg-white/50 dark:hover:bg-white/[0.04]"
                      )}
                    >
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-bold">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[9.5px]">
                          №{b._rank}
                        </span>
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-mono text-[9.5px] text-muted-foreground whitespace-nowrap">
                        {formatDateTimeRu(b.createdAt)}
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-semibold">
                        {b.campaignName || "—"}
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] font-medium">
                        {b.surname}
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-medium">
                        {b.startDate} — {b.endDate}
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center">
                        <span className="px-1.5 py-0.2 rounded-full bg-black/[0.05] dark:bg-white/[0.08] font-semibold text-[9.5px]">
                          {b.format}
                        </span>
                      </td>
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center">
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
                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06] text-center font-mono font-bold text-primary">
                        {b.duration} сек
                      </td>

                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06]">
                        {b._alertLevel === "ok" ? (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold text-[9.5px]">
                            <ShieldCheck className="w-3 h-3 shrink-0" />
                            В квоте (№{b._rank})
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-white font-bold text-[9.5px]",
                                b._alertLevel === "red" ? "bg-red-600" : "bg-orange-500"
                              )}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              {b._alertLevel === "red"
                                ? `Красное пред. в ${b._conflicts.filter((c) => c.level === "red").length} ТК`
                                : `Оранжевое пред. в ${b._conflicts.length} ТК`}
                            </div>
                            <div className="text-[9px] max-h-12 overflow-y-auto space-y-0.5">
                              {b._conflicts.slice(0, 2).map((c) => (
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
                              {b._conflicts.length > 2 && (
                                <div>...и еще {b._conflicts.length - 2} ТК</div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-1 border-r border-black/[0.05] dark:border-white/[0.06]">
                        <span className="font-semibold text-[10px] mr-1">
                          {b.shoppingCenterNumbers.length} ТК:
                        </span>
                        <span
                          className="text-[9.5px] text-muted-foreground max-w-[260px] inline-block truncate align-bottom"
                          title={b.tkNumbersRaw}
                        >
                          {b.tkNumbersRaw}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(b.id, b.surname)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-red-600 hover:underline"
                          title="Удалить бронь"
                        >
                          <Trash2 className="w-3 h-3" />
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
          <div className="glass-panel rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10.5px] border-collapse">
                <thead className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] text-muted-foreground shadow-2xs">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[46px]">№ ТК</th>
                    <th className="px-1 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[42px]">Форм.</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[112px]">Город</th>
                    <th className="px-2 py-1.5 text-left border-r border-black/[0.05] dark:border-white/[0.06] w-[185px]">Адрес</th>
                    <th className="px-1.5 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[88px]">
                      Суммарно (≤{TK_QUOTAS.TOTAL_MAX}с)
                    </th>
                    <th className="px-1.5 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[96px]">
                      Платно (≤{TK_QUOTAS.PAID_MAX}с)
                    </th>
                    <th className="px-1.5 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[88px]">
                      Бесплатно (30%)
                    </th>
                    <th className="px-1.5 py-1.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] w-[82px]">
                      Освободится
                    </th>
                    <th className="px-2 py-1.5 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          Рекламные кампании на {format(selectedDate, "dd.MM.yyyy")}
                        </span>
                        {allExpandableNums.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleExpandAll}
                            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                          >
                            {areAllExpanded ? (
                              <>
                                Свернуть все <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                Развернуть все <ChevronDown className="w-3 h-3" />
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
                          "border-b border-black/[0.05] dark:border-white/[0.06] transition-colors align-middle",
                          tk.alertLevel === "red"
                            ? "bg-red-500/12 hover:bg-red-500/18"
                            : tk.alertLevel === "orange"
                            ? "bg-orange-500/12 hover:bg-orange-500/18"
                            : "hover:bg-white/50 dark:hover:bg-white/[0.04]"
                        )}
                      >
                        <td
                          className={cn(
                            "px-2 py-0.5 font-bold border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap",
                            tk.alertLevel === "red" && "bg-red-600 text-white",
                            tk.alertLevel === "orange" && "bg-orange-500 text-white"
                          )}
                          title={tk.alertReason}
                        >
                          №{tk.number}
                        </td>

                        <td className="px-1 py-0.5 text-center border-r border-black/[0.05] dark:border-white/[0.06]">
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0 rounded-full text-[9px] font-semibold",
                              tk.format === "ГМ"
                                ? "bg-primary/15 text-primary"
                                : "bg-black/[0.06] dark:bg-white/[0.1] text-foreground"
                            )}
                          >
                            {tk.format}
                          </span>
                        </td>

                        <td className="px-2 py-0.5 font-medium border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                          {tk.city}
                        </td>

                        <td
                          className="px-2 py-0.5 text-foreground/90 border-r border-black/[0.05] dark:border-white/[0.06] truncate max-w-[185px]"
                          title={tk.address}
                        >
                          {tk.address}
                        </td>

                        <td
                          className={cn(
                            "px-1.5 py-0.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono font-bold",
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
                            <div className="text-[8.5px] font-normal text-amber-600 dark:text-amber-400 leading-none">
                              +бронь {tk.bookedTotalDuration}с
                            </div>
                          )}
                        </td>

                        <td
                          className={cn(
                            "px-1.5 py-0.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono leading-tight",
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
                              "text-[8.5px] font-normal",
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
                            "px-1.5 py-0.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap font-mono leading-tight",
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
                            <div className="text-[8.5px] font-normal text-emerald-600 dark:text-emerald-400">
                              резерв &gt;20с OK
                            </div>
                          )}
                        </td>

                        <td className="px-1.5 py-0.5 text-center border-r border-black/[0.05] dark:border-white/[0.06] whitespace-nowrap">
                          {tk.earliestEndDate ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9.5px] text-muted-foreground"
                              title={`После ${tk.earliestEndDate} освободится ${tk.freedSeconds} сек`}
                            >
                              <Clock className="w-2.5 h-2.5" />-{tk.freedSeconds}с с{" "}
                              {formatShortDate(tk.earliestEndDate)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-2 py-0.5">
                          {!tk.hasAnyItems && tk.plannedList.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              опубликовано: 0 РК (0 сек) • запланировано: 0 РК (0 сек)
                            </span>
                          ) : (
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] border",
                                    tk.activeList.length > 0
                                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/35 font-semibold"
                                      : "bg-black/[0.03] dark:bg-white/[0.04] text-muted-foreground border-transparent"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
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
                                    "inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] border",
                                    tk.plannedList.length > 0
                                      ? "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/35 font-semibold"
                                      : "bg-black/[0.03] dark:bg-white/[0.04] text-muted-foreground border-transparent"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      tk.plannedList.length > 0
                                        ? "bg-blue-500"
                                        : "bg-muted-foreground/40"
                                    )}
                                  />
                                  запланировано: <strong>{tk.plannedList.length} РК</strong> на{" "}
                                  <strong className="font-mono">{tk.plannedDuration} сек</strong>
                                </span>

                                {includeBookingsInTk && tk.bookingsInTk.length > 0 && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 font-semibold">
                                    бронь: {tk.bookingsInTk.length} на {tk.bookedTotalDuration} сек
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => toggleExpandTk(tk.number)}
                                  className="inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full glass-pill text-[9.5px] font-medium text-primary shrink-0 hover:opacity-90"
                                >
                                  {isExpanded ? (
                                    <>
                                      Свернуть <ChevronUp className="w-2.5 h-2.5" />
                                    </>
                                  ) : (
                                    <>
                                      Развернуть <ChevronDown className="w-2.5 h-2.5" />
                                    </>
                                  )}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="mt-1 pt-1 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap gap-1">
                                  {tk.shownList.map((camp) => {
                                    const isPub = camp._statusOnDate === "опубликовано"
                                    const isPlan = camp._statusOnDate === "запланировано"
                                    return (
                                      <div
                                        key={`c-${camp.id}`}
                                        className={cn(
                                          "inline-flex items-center gap-1 border rounded-lg px-1.5 py-0.5 text-[10px] border-l-3 backdrop-blur-md",
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
                                        <span className="text-muted-foreground">({camp.client})</span>
                                        <span className="font-mono font-bold text-primary">
                                          {camp.duration}с
                                        </span>
                                        <span className="text-[9px] px-1 rounded-full bg-white/70 dark:bg-black/40">
                                          {camp._format}
                                        </span>
                                        <span
                                          className={cn(
                                            "text-[9px] font-semibold",
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
                                        className="inline-flex items-center gap-1 border rounded-lg px-1.5 py-0.5 text-[10px] border-l-3 bg-amber-500/15 border-amber-500/40 border-l-amber-600"
                                      >
                                        <span className="px-1 rounded-full bg-amber-600 text-white text-[9px] font-bold">
                                          бронь №{b._rank}
                                        </span>
                                        <span className="font-semibold">
                                          {b.campaignName || b.surname}
                                        </span>
                                        <span className="text-muted-foreground">({b.surname})</span>
                                        <span className="font-mono font-bold">{b.duration}с</span>
                                        <span className="text-[9px] px-1 rounded-full bg-white/70 dark:bg-black/40">
                                          {b.format}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground">
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
          <div className="glass-panel rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10.5px] border-collapse min-w-max">
                <thead className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl sticky top-0 z-20">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-r border-black/[0.06] dark:border-white/[0.08] sticky left-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl min-w-[240px]">
                      Кампания / Заказчик / Статус на {format(selectedDate, "dd.MM.yyyy")}
                    </th>
                    {filteredTkRows.map((tk) => (
                      <th
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-b border-r border-black/[0.06] dark:border-white/[0.08] text-center min-w-[60px] max-w-[70px]",
                          tk.alertLevel === "red" && "bg-red-600 text-white",
                          tk.alertLevel === "orange" && "bg-orange-500 text-white"
                        )}
                        title={`ТК №${tk.number} (${tk.city}, ${tk.address}) | ${tk.alertReason}`}
                      >
                        <div className="font-bold text-[10px]">№{tk.number}</div>
                        <div
                          className={cn(
                            "text-[8.5px]",
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
                      <tr
                        key={`mc-${camp.id}`}
                        className="border-b border-black/[0.05] dark:border-white/[0.06] hover:bg-white/50 dark:hover:bg-white/[0.04]"
                      >
                        <td
                          className={cn(
                            "px-2 py-0.5 border-r border-black/[0.06] dark:border-white/[0.08] sticky left-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-l-3",
                            isPub && "border-l-emerald-600",
                            isPlan && "border-l-blue-600",
                            !isPub && !isPlan && "border-l-zinc-400"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-[10.5px] truncate">{camp.name}</span>
                            {getStatusBadge(camp._statusOnDate, camp.startDate)}
                          </div>
                          <div className="text-[9px] text-muted-foreground flex items-center gap-1">
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
                                "border-r border-black/[0.05] dark:border-white/[0.06] px-0.5 py-0.5 text-center",
                                tk.alertLevel === "red" && "bg-red-500/10",
                                tk.alertLevel === "orange" && "bg-orange-500/10"
                              )}
                            >
                              {isPlaced ? (
                                <span
                                  className={cn(
                                    "inline-block px-1.5 py-0 rounded-full font-bold text-[9px]",
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

                <tfoot className="sticky bottom-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-black/10 dark:border-white/15">
                  <tr className="font-bold text-[10px]">
                    <td className="px-2 py-1 border-r border-black/[0.06] dark:border-white/[0.08] sticky left-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl">
                      Суммарно в эфире (лимит {TK_QUOTAS.TOTAL_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-1 border-r border-black/[0.06] dark:border-white/[0.08] text-center font-mono",
                          tk.alertLevel === "red" && "bg-red-600 text-white",
                          tk.alertLevel === "orange" && "bg-orange-500 text-white"
                        )}
                      >
                        {tk.totalDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="text-[9px]">
                    <td className="px-2 py-0.5 border-r border-black/[0.06] dark:border-white/[0.08] sticky left-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl font-medium">
                      Платно (лимит {TK_QUOTAS.PAID_MAX}с)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-0.5 border-r border-black/[0.06] dark:border-white/[0.08] text-center font-mono",
                          tk.isOverPaid
                            ? "bg-red-600 text-white font-bold"
                            : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {tk.paidDuration}с
                      </td>
                    ))}
                  </tr>

                  <tr className="text-[9px]">
                    <td className="px-2 py-0.5 border-r border-black/[0.06] dark:border-white/[0.08] sticky left-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl font-medium">
                      Бесплатно (30%)
                    </td>
                    {filteredTkRows.map((tk) => (
                      <td
                        key={tk.number}
                        className={cn(
                          "px-1 py-0.5 border-r border-black/[0.06] dark:border-white/[0.08] text-center font-mono",
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
