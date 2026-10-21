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
import { cn } from "@/lib/utils"
import { getApiUrl } from "@/lib/api"
import { CITIES, MASTER_TK_LIST, TK_QUOTAS } from "@/lib/constants"

export const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
export const FORMAT_OPTIONS = ["ГМ", "СМ", "ГМ+СМ", "част.ГМ", "част.СМ"] as const
export const TYPE_OPTIONS = [
  { label: "платный", value: "Платник" },
  { label: "не платный", value: "Не платник" },
] as const

export interface InitialCampaignForm {
  name: string
  client: string
  duration: string
  format: string
  type: string
  shoppingCenterNumbers: string
  startDate?: Date
  endDate?: Date
}

interface FormState {
  name: string
  startDate: Date | undefined
  endDate: Date | undefined
  client: string
  duration: string
  format: string
  type: string
  shoppingCenterNumbers: string
}

const emptyForm = (): FormState => ({
  name: "",
  startDate: undefined,
  endDate: undefined,
  client: "",
  duration: "",
  format: "",
  type: "",
  shoppingCenterNumbers: "",
})

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: InitialCampaignForm | null
}

export function AddCampaignDialog({ open, onOpenChange, initialData }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [showTkPicker, setShowTkPicker] = useState(false)
  const [tkSearch, setTkSearch] = useState("")
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

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
    if (open && initialData) {
      setForm({
        name: initialData.name || "",
        startDate: initialData.startDate,
        endDate: initialData.endDate,
        client: initialData.client || "",
        duration: initialData.duration || "",
        format: initialData.format || "",
        type: initialData.type || "",
        shoppingCenterNumbers: initialData.shoppingCenterNumbers || "",
      })
      setErrors({})
    } else if (open && !initialData) {
      setForm(emptyForm())
      setErrors({})
    }
  }, [open, initialData])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const selectedNumbersSet = useMemo(() => {
    return new Set(
      form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }, [form.shoppingCenterNumbers])

  const fillTkByFormat = (fmt: "ГМ" | "СМ" | "ГМ+СМ") => {
    const nums =
      fmt === "ГМ+СМ"
        ? MASTER_TK_LIST.map((t) => t.number)
        : MASTER_TK_LIST.filter((t) => t.format === fmt).map((t) => t.number)
    set("shoppingCenterNumbers", nums.join(", "))
  }

  const handleFormatChange = (v: string) => {
    set("format", v)
    if (v === "ГМ") fillTkByFormat("ГМ")
    else if (v === "СМ") fillTkByFormat("СМ")
    else if (v === "ГМ+СМ") fillTkByFormat("ГМ+СМ")
  }

  const toggleCityTks = (city: string) => {
    const targetFormat =
      form.format === "ГМ" || form.format === "част.ГМ"
        ? "ГМ"
        : form.format === "СМ" || form.format === "част.СМ"
        ? "СМ"
        : null

    const cityTks = MASTER_TK_LIST.filter(
      (t) => t.city === city && (!targetFormat || t.format === targetFormat)
    ).map((t) => t.number)

    if (cityTks.length === 0) return

    const next = new Set(selectedNumbersSet)
    const allAlreadySelected = cityTks.every((n) => next.has(n))
    if (allAlreadySelected) {
      cityTks.forEach((n) => next.delete(n))
    } else {
      cityTks.forEach((n) => next.add(n))
    }
    set("shoppingCenterNumbers", Array.from(next).join(", "))
  }

  const toggleSingleTk = (num: string) => {
    const next = new Set(selectedNumbersSet)
    if (next.has(num)) next.delete(num)
    else next.add(num)
    set("shoppingCenterNumbers", Array.from(next).join(", "))
  }

  // Проверка перегруза квот (180с всего / 125с платно / 55с бесплатно) на выбранный период
  const quotaWarnings = useMemo(() => {
    if (!form.startDate || !form.endDate || !form.duration || !form.type || selectedNumbersSet.size === 0) {
      return []
    }
    if (form.startDate > form.endDate) return []

    const startIso = format(form.startDate, "yyyy-MM-dd")
    const endIso = format(form.endDate, "yyyy-MM-dd")
    const addedDur = Number(form.duration) || 0
    const isNewPaid = form.type === "Платник"

    // Находим кампании, пересекающиеся по датам с [startIso, endIso]
    const overlapping = existingCampaigns.filter(
      (c) => c.startDate <= endIso && c.endDate >= startIso
    )

    const warnings: { tkNumber: string; maxTotal: number; maxPaid: number; maxFree: number }[] = []

    for (const tkNum of Array.from(selectedNumbersSet)) {
      const tkCamps = overlapping.filter((c) =>
        (c.shoppingCenters || []).some((s: any) => String(s.number).trim() === tkNum)
      )

      // Проверяем ключевые точки пересечения (startDate каждой активной РК в этом ТК внутри периода)
      const checkDates = new Set<string>([startIso, endIso])
      for (const c of tkCamps) {
        if (c.startDate >= startIso && c.startDate <= endIso) checkDates.add(c.startDate)
      }

      let maxTotal = addedDur
      let maxPaid = isNewPaid ? addedDur : 0
      let maxFree = !isNewPaid ? addedDur : 0

      for (const d of checkDates) {
        let paidOnDay = isNewPaid ? addedDur : 0
        let freeOnDay = !isNewPaid ? addedDur : 0

        for (const c of tkCamps) {
          if (c.startDate <= d && c.endDate >= d) {
            const cPaid =
              c.status === "Платник" ||
              c.status === "платный" ||
              (c.note && c.note.toLowerCase().includes("платн") && !c.note.toLowerCase().includes("не "))
            if (cPaid) paidOnDay += Number(c.duration) || 0
            else freeOnDay += Number(c.duration) || 0
          }
        }

        const totalOnDay = paidOnDay + freeOnDay
        if (totalOnDay > maxTotal) maxTotal = totalOnDay
        if (paidOnDay > maxPaid) maxPaid = paidOnDay
        if (freeOnDay > maxFree) maxFree = freeOnDay
      }

      if (
        maxTotal > TK_QUOTAS.TOTAL_MAX ||
        maxPaid > TK_QUOTAS.PAID_MAX ||
        maxFree > TK_QUOTAS.FREE_MAX
      ) {
        warnings.push({ tkNumber: tkNum, maxTotal, maxPaid, maxFree })
      }
    }

    return warnings
  }, [form.startDate, form.endDate, form.duration, form.type, selectedNumbersSet, existingCampaigns])

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) errs.name = "Введите название"
    if (!form.startDate) errs.startDate = "Выберите дату старта"
    if (!form.endDate) errs.endDate = "Выберите дату окончания"
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      errs.endDate = "Дата окончания раньше даты старта"
    }
    if (!form.client.trim()) errs.client = "Введите заказчика"
    if (!form.duration) errs.duration = "Выберите длительность"
    if (!form.format) errs.format = "Выберите формат"
    if (!form.type) errs.type = "Выберите тип"
    if (!form.shoppingCenterNumbers.trim()) errs.shoppingCenterNumbers = "Укажите номера ТК через запятую"

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const scNumbers = form.shoppingCenterNumbers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const body = {
        name: form.name.trim(),
        startDate: format(form.startDate!, "yyyy-MM-dd"),
        endDate: format(form.endDate!, "yyyy-MM-dd"),
        client: form.client.trim(),
        duration: Number(form.duration),
        tkType: form.format,
        tk_type: form.format,
        status: form.type,
        shoppingCenterNumbers: scNumbers,
        note: form.type === "Платник" ? "платный" : "не платный",
      }

      const res = await fetch(getApiUrl("/api/campaigns"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Ошибка ${res.status}`)
      }

      toast({ title: "Данные успешно загружены", variant: "success" })
      queryClient.invalidateQueries()
      setForm(emptyForm())
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const filteredPickerTks = useMemo(() => {
    return MASTER_TK_LIST.filter((t) => {
      if (form.format === "ГМ" || form.format === "част.ГМ") {
        if (t.format !== "ГМ") return false
      } else if (form.format === "СМ" || form.format === "част.СМ") {
        if (t.format !== "СМ") return false
      }
      if (tkSearch.trim()) {
        const q = tkSearch.trim().toLowerCase()
        return (
          t.number.toLowerCase().includes(q) ||
          t.city.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [form.format, tkSearch])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Копирование рекламной кампании" : "Загрузка данных рекламной кампании"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3.5 py-2">
          {/* 1. Название */}
          <div className="grid gap-1">
            <Label>Название <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Введите название кампании"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* 2. Дата старта и 3. Дата окончания */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Дата старта <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !form.startDate && "text-muted-foreground",
                      errors.startDate && "border-destructive"
                    )}
                  >
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
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {errors.startDate && <p className="text-xs text-destructive">{errors.startDate}</p>}
            </div>

            <div className="grid gap-1">
              <Label>Дата окончания <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !form.endDate && "text-muted-foreground",
                      errors.endDate && "border-destructive"
                    )}
                  >
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
                    initialFocus
                    disabled={form.startDate ? { before: form.startDate } : undefined}
                  />
                </PopoverContent>
              </Popover>
              {errors.endDate && <p className="text-xs text-destructive">{errors.endDate}</p>}
            </div>
          </div>

          {/* 4. Заказчик */}
          <div className="grid gap-1">
            <Label>Заказчик <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Введите название заказчика"
              value={form.client}
              onChange={(e) => set("client", e.target.value)}
              className={cn(errors.client && "border-destructive")}
            />
            {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
          </div>

          {/* 5. Длительность, 6. Формат, 7. Тип */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label>Длительность <span className="text-destructive">*</span></Label>
              <Select value={form.duration} onValueChange={(v) => set("duration", v)}>
                <SelectTrigger className={cn(errors.duration && "border-destructive")}>
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
              {errors.duration && <p className="text-xs text-destructive">{errors.duration}</p>}
            </div>

            <div className="grid gap-1">
              <Label>Формат <span className="text-destructive">*</span></Label>
              <Select value={form.format} onValueChange={handleFormatChange}>
                <SelectTrigger className={cn(errors.format && "border-destructive")}>
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
              {errors.format && <p className="text-xs text-destructive">{errors.format}</p>}
            </div>

            <div className="grid gap-1">
              <Label>Тип <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger className={cn(errors.type && "border-destructive")}>
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
              {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
            </div>
          </div>

          {/* 8. Список ТК + Быстрый выбор городов и справочник с галочками */}
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label>
                Список ТК ({selectedNumbersSet.size} выбрано) <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => fillTkByFormat("ГМ")}
                  className="text-primary hover:underline font-medium"
                >
                  Все ГМ (94)
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => fillTkByFormat("СМ")}
                  className="text-primary hover:underline font-medium"
                >
                  Все СМ (79)
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => fillTkByFormat("ГМ+СМ")}
                  className="text-primary hover:underline font-medium"
                >
                  Все ГМ+СМ (173)
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
              className={cn(errors.shoppingCenterNumbers && "border-destructive")}
            />

            {/* Быстрые кнопки выбора по городам */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[11px] text-muted-foreground mr-1">По городам:</span>
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => toggleCityTks(city)}
                  className="text-[11px] px-1.5 py-0.5 rounded border bg-muted/40 hover:bg-muted transition-colors"
                >
                  + {city}
                </button>
              ))}
            </div>

            {/* Раскрывающийся список ТК с галочками */}
            <div>
              <button
                type="button"
                onClick={() => setShowTkPicker((v) => !v)}
                className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
              >
                {showTkPicker ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showTkPicker ? "Скрыть выбор ТК галочками" : "Выбрать отдельные ТК галочками из списка"}
              </button>

              {showTkPicker && (
                <div className="mt-1.5 border rounded-md p-2 bg-muted/20 space-y-2">
                  <Input
                    placeholder="Поиск по № ТК, городу или адресу..."
                    value={tkSearch}
                    onChange={(e) => setTkSearch(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="max-h-[160px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                    {filteredPickerTks.map((tk) => (
                      <label
                        key={tk.number}
                        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted cursor-pointer truncate"
                        title={`${tk.city}, ${tk.address}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedNumbersSet.has(tk.number)}
                          onChange={() => toggleSingleTk(tk.number)}
                        />
                        <span className="font-bold">№{tk.number}</span>
                        <span className="text-[10px] px-1 rounded bg-muted">{tk.format}</span>
                        <span className="text-muted-foreground truncate">{tk.city} — {tk.address}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errors.shoppingCenterNumbers && (
              <p className="text-xs text-destructive">{errors.shoppingCenterNumbers}</p>
            )}
          </div>

          {/* Предупреждение о превышении квот (180с / 125с платно / 55с бесплатно) */}
          {quotaWarnings.length > 0 && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Внимание: превышение квоты хронометража в {quotaWarnings.length} ТК!
              </div>
              <div className="text-[11px] max-h-[80px] overflow-y-auto space-y-0.5">
                {quotaWarnings.slice(0, 12).map((w) => (
                  <div key={w.tkNumber}>
                    • <strong>ТК №{w.tkNumber}</strong>: суммарно {w.maxTotal}/{TK_QUOTAS.TOTAL_MAX}с (платно{" "}
                    {w.maxPaid}/{TK_QUOTAS.PAID_MAX}с, беспл. {w.maxFree}/{TK_QUOTAS.FREE_MAX}с)
                  </div>
                ))}
                {quotaWarnings.length > 12 && (
                  <div>...и ещё в {quotaWarnings.length - 12} ТК</div>
                )}
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
