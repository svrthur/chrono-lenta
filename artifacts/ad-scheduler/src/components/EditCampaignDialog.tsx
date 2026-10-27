import React, { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, CheckIcon, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { getApiUrl } from "@/lib/api"
import { CITIES, MASTER_TK_LIST, TK_QUOTAS } from "@/lib/constants"
import { DURATION_OPTIONS, FORMAT_OPTIONS, TYPE_OPTIONS } from "./AddCampaignDialog"

const TOTAL_TK_COUNT = MASTER_TK_LIST.length
const TOTAL_GM_COUNT = MASTER_TK_LIST.filter((t) => t.format === "ГМ").length
const TOTAL_SM_COUNT = MASTER_TK_LIST.filter((t) => t.format === "СМ").length

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | null
}

export default function EditCampaignDialog({ open, onOpenChange, campaignId }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [showTkPicker, setShowTkPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [form, setForm] = useState<{
    name: string
    startDate: Date | undefined
    endDate: Date | undefined
    client: string
    duration: string
    format: string
    type: string
    shoppingCenterNumbers: string
  }>({
    name: "",
    startDate: undefined,
    endDate: undefined,
    client: "",
    duration: "30",
    format: "ГМ",
    type: "Не платник",
    shoppingCenterNumbers: "",
  })

  const { data: existingCampaigns = [] } = useQuery<any[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/campaigns"))
      if (!res.ok) return []
      return res.json()
    },
    enabled: open,
  })

  useEffect(() => {
    if (!campaignId) return
    let mounted = true
    fetch(getApiUrl(`/api/campaigns/${campaignId}`))
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        const isPaid =
          data.status === "Платник" ||
          data.status === "платный" ||
          (data.note && data.note.toLowerCase().includes("платн") && !data.note.toLowerCase().includes("не "))

        setForm({
          name: data.name || "",
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          client: data.client || "",
          duration: String(data.duration || "30"),
          format: data.tkType || data.tk_type || "ГМ",
          type: isPaid ? "Платник" : "Не платник",
          shoppingCenterNumbers: (data.shoppingCenters || []).map((s: any) => s.number).join(", "),
        })
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [campaignId])

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const selectedNumbersSet = useMemo(() => {
    return new Set(
      form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }, [form.shoppingCenterNumbers])

  const updateNumbersFromSet = (nextSet: Set<string>) => {
    const ordered = MASTER_TK_LIST.filter((t) => nextSet.has(t.number)).map((t) => t.number)
    const custom = Array.from(nextSet).filter((n) => !MASTER_TK_LIST.some((t) => t.number === n))
    set("shoppingCenterNumbers", [...ordered, ...custom].join(", "))
  }

  const fillTkByFormat = (fmt: "ГМ" | "СМ" | "ГМ+СМ") => {
    if (fmt === "ГМ+СМ") {
      set("shoppingCenterNumbers", MASTER_TK_LIST.map((t) => t.number).join(", "))
      return
    }
    const nums = MASTER_TK_LIST.filter((t) => t.format === fmt).map((t) => t.number)
    set("shoppingCenterNumbers", nums.join(", "))
  }

  const handleFormatChange = (v: string) => {
    set("format", v)
    if (v === "ГМ") fillTkByFormat("ГМ")
    else if (v === "СМ") fillTkByFormat("СМ")
    else if (v === "ГМ+СМ") fillTkByFormat("ГМ+СМ")
  }

  const toggleCityTks = (city: string) => {
    const next = new Set(selectedNumbersSet)
    const cityTks = MASTER_TK_LIST.filter((t) => {
      if (t.city !== city) return false
      if (form.format === "ГМ" || form.format === "част.ГМ") return t.format === "ГМ"
      if (form.format === "СМ" || form.format === "част.СМ") return t.format === "СМ"
      return true
    })
    const allSelected = cityTks.length > 0 && cityTks.every((t) => next.has(t.number))
    for (const tk of cityTks) {
      if (allSelected) next.delete(tk.number)
      else next.add(tk.number)
    }
    updateNumbersFromSet(next)
  }

  const toggleSingleTk = (num: string) => {
    const next = new Set(selectedNumbersSet)
    if (next.has(num)) next.delete(num)
    else next.add(num)
    updateNumbersFromSet(next)
  }

  const overloadWarnings = useMemo(() => {
    if (!form.startDate || !form.endDate || !form.duration || !form.type || selectedNumbersSet.size === 0) {
      return []
    }
    const startIso = format(form.startDate, "yyyy-MM-dd")
    const endIso = format(form.endDate, "yyyy-MM-dd")
    if (startIso > endIso) return []

    const addDur = Number(form.duration) || 0
    const addIsPaid = form.type === "Платник"

    const preparedExisting = existingCampaigns
      .filter((c) => c.id !== campaignId)
      .map((c) => {
        const isPaid =
          c.status === "Платник" ||
          c.status === "платный" ||
          (c.note && c.note.toLowerCase().includes("платн") && !c.note.toLowerCase().includes("не "))
        const scSet = new Set((c.shoppingCenters || []).map((s: any) => String(s.number).trim()))
        return {
          startDate: String(c.startDate),
          endDate: String(c.endDate),
          duration: Number(c.duration) || 0,
          isPaid: Boolean(isPaid),
          scSet,
        }
      })

    const warnings: {
      tkNumber: string
      city: string
      peakDate: string
      totalSec: number
      paidSec: number
      freeSec: number
    }[] = []

    for (const tkNum of Array.from(selectedNumbersSet)) {
      const overlapping = preparedExisting.filter(
        (c) => c.scSet.has(tkNum) && c.startDate <= endIso && c.endDate >= startIso
      )

      const candidateDates = new Set<string>([startIso])
      for (const c of overlapping) {
        if (c.startDate >= startIso && c.startDate <= endIso) {
          candidateDates.add(c.startDate)
        }
      }

      let maxTotal = 0
      let maxPaid = 0
      let maxFree = 0
      let worstDate = startIso

      for (const d of Array.from(candidateDates).sort()) {
        let paid = addIsPaid ? addDur : 0
        let free = addIsPaid ? 0 : addDur
        for (const c of overlapping) {
          if (c.startDate <= d && c.endDate >= d) {
            if (c.isPaid) paid += c.duration
            else free += c.duration
          }
        }
        const total = paid + free
        if (total > maxTotal || paid > maxPaid || free > maxFree) {
          maxTotal = Math.max(maxTotal, total)
          maxPaid = Math.max(maxPaid, paid)
          maxFree = Math.max(maxFree, free)
          worstDate = d
        }
      }

      if (
        maxTotal > TK_QUOTAS.TOTAL_MAX ||
        maxPaid > TK_QUOTAS.PAID_MAX ||
        maxFree > TK_QUOTAS.FREE_MAX
      ) {
        const tkInfo = MASTER_TK_LIST.find((t) => t.number === tkNum)
        warnings.push({
          tkNumber: tkNum,
          city: tkInfo?.city || "",
          peakDate: worstDate,
          totalSec: maxTotal,
          paidSec: maxPaid,
          freeSec: maxFree,
        })
      }
    }

    return warnings
  }, [form.startDate, form.endDate, form.duration, form.type, selectedNumbersSet, existingCampaigns, campaignId])

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast({ title: "Введите название", variant: "destructive" })
    if (!form.startDate || !form.endDate) return toast({ title: "Выберите даты старта и окончания", variant: "destructive" })
    if (form.startDate > form.endDate) return toast({ title: "Дата окончания раньше даты старта", variant: "destructive" })

    setLoading(true)
    try {
      const scNumbers = form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const body = {
        name: form.name.trim(),
        startDate: format(form.startDate, "yyyy-MM-dd"),
        endDate: format(form.endDate, "yyyy-MM-dd"),
        client: form.client.trim(),
        duration: Number(form.duration),
        tkType: form.format,
        tk_type: form.format,
        status: form.type,
        shoppingCenterNumbers: scNumbers,
        note: form.type === "Платник" ? "платный" : "не платный",
      }

      const res = await fetch(getApiUrl(`/api/campaigns/${campaignId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }

      toast({ title: "Данные обновлены", variant: "success" })
      queryClient.invalidateQueries()
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: "Ошибка", description: String(err.message || err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const filteredMasterList = useMemo(() => {
    return MASTER_TK_LIST.filter((tk) => {
      if (form.format === "ГМ" || form.format === "част.ГМ") {
        if (tk.format !== "ГМ") return false
      } else if (form.format === "СМ" || form.format === "част.СМ") {
        if (tk.format !== "СМ") return false
      }
      if (pickerSearch.trim()) {
        const q = pickerSearch.trim().toLowerCase()
        return (
          tk.number.toLowerCase().includes(q) ||
          tk.city.toLowerCase().includes(q) ||
          tk.address.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [form.format, pickerSearch])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактирование данных кампании</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3.5 py-2">
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Дата старта</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.startDate ? format(form.startDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.startDate}
                    onSelect={(d) => set("startDate", d)}
                    locale={ru}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-1.5">
              <Label>Дата окончания</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.endDate ? format(form.endDate, "dd.MM.yyyy", { locale: ru }) : "Выбрать дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.endDate}
                    onSelect={(d) => set("endDate", d)}
                    locale={ru}
                    disabled={form.startDate ? { before: form.startDate } : undefined}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Заказчик</Label>
            <Input value={form.client} onChange={(e) => set("client", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Длительность</Label>
              <Select value={form.duration} onValueChange={(v) => set("duration", v)}>
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

            <div className="grid gap-1.5">
              <Label>Формат</Label>
              <Select value={form.format} onValueChange={handleFormatChange}>
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
              <Label>Тип</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label>Список ТК ({selectedNumbersSet.size} выбр.)</Label>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => fillTkByFormat("ГМ")}
                  className="text-primary hover:underline font-medium"
                >
                  Все ГМ ({TOTAL_GM_COUNT})
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => fillTkByFormat("СМ")}
                  className="text-primary hover:underline font-medium"
                >
                  Все СМ ({TOTAL_SM_COUNT})
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => fillTkByFormat("ГМ+СМ")}
                  className="text-primary hover:underline font-medium"
                >
                  ГМ+СМ ({TOTAL_TK_COUNT})
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => set("shoppingCenterNumbers", "")}
                  className="text-muted-foreground hover:underline"
                >
                  Очистить
                </button>
              </div>
            </div>

            <Input
              placeholder="Например: 2, 3, 15, 104"
              value={form.shoppingCenterNumbers}
              onChange={(e) => set("shoppingCenterNumbers", e.target.value)}
            />

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Номера через запятую или выберите города/ТК ниже
              </p>
              <button
                type="button"
                onClick={() => setShowTkPicker((v) => !v)}
                className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
              >
                {showTkPicker ? (
                  <>
                    Скрыть подбор ТК <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Подобрать по городам / адресам <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {showTkPicker && (
              <div className="border rounded-md p-2.5 bg-muted/20 space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Быстрый выбор по городам:
                </div>
                <div className="flex flex-wrap gap-1">
                  {CITIES.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleCityTks(city)}
                      className="px-2 py-0.5 text-[11px] rounded border bg-background hover:bg-primary/10 transition-colors"
                    >
                      + {city}
                    </button>
                  ))}
                </div>

                <Input
                  placeholder="Поиск ТК по номеру, городу или адресу..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="h-7 text-xs"
                />

                <div className="max-h-36 overflow-y-auto border rounded bg-background p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {filteredMasterList.map((tk) => (
                    <label
                      key={tk.number}
                      className="flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedNumbersSet.has(tk.number)}
                        onChange={() => toggleSingleTk(tk.number)}
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

          {overloadWarnings.length > 0 && (
            <div className="p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Внимание: превышение квоты (180с / 125с платно / 55с беспл.) в {overloadWarnings.length} ТК!
              </div>
              <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                {overloadWarnings.map((w) => (
                  <div key={w.tkNumber}>
                    • <strong>ТК №{w.tkNumber}</strong> ({w.city}) на {w.peakDate}: Суммарно{" "}
                    <strong>{w.totalSec}/{TK_QUOTAS.TOTAL_MAX}с</strong>, Платно{" "}
                    <strong>{w.paidSec}/{TK_QUOTAS.PAID_MAX}с</strong>, Беспл.{" "}
                    <strong>{w.freeSec}/{TK_QUOTAS.FREE_MAX}с</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <CheckIcon className="w-4 h-4 mr-2" />
            {loading ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
