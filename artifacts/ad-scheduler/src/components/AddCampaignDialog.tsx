import React, { useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, CheckIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
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
import { MASTER_TK_LIST } from "@/lib/constants"

export const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
export const FORMAT_OPTIONS = ["ГМ", "СМ", "част.ГМ", "част.СМ"] as const
export const TYPE_OPTIONS = [
  { label: "платный", value: "Платник" },
  { label: "не платный", value: "Не платник" },
] as const

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
}

export function AddCampaignDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const fillTkByFormat = (fmt: "ГМ" | "СМ") => {
    const nums = MASTER_TK_LIST.filter((t) => t.format === fmt).map((t) => t.number)
    set("shoppingCenterNumbers", nums.join(", "))
  }

  const handleFormatChange = (v: string) => {
    set("format", v)
    if (v === "ГМ") {
      fillTkByFormat("ГМ")
    } else if (v === "СМ") {
      fillTkByFormat("СМ")
    }
  }

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Загрузка данных рекламной кампании</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 1. Название */}
          <div className="grid gap-1.5">
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
            <div className="grid gap-1.5">
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

            <div className="grid gap-1.5">
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
          <div className="grid gap-1.5">
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
            <div className="grid gap-1.5">
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

            <div className="grid gap-1.5">
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

            <div className="grid gap-1.5">
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

          {/* 8. Список ТК */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Список ТК <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => fillTkByFormat("ГМ")}
                  className="text-primary hover:underline"
                >
                  Все ГМ (94)
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => fillTkByFormat("СМ")}
                  className="text-primary hover:underline"
                >
                  Все СМ (79)
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
            <p className="text-xs text-muted-foreground">
              При выборе формата ГМ или СМ список заполняется автоматически (для част.ГМ / част.СМ укажите номера через запятую)
            </p>
            {errors.shoppingCenterNumbers && (
              <p className="text-xs text-destructive">{errors.shoppingCenterNumbers}</p>
            )}
          </div>
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
