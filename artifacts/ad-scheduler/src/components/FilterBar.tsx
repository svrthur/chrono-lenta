import React, { useRef } from "react"
import { useFilterStore } from "@/store/filters"
import { CITIES } from "@/lib/constants"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { MultiSelect } from "@/components/ui/multi-select"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, UploadIcon, RotateCcwIcon, HistoryIcon } from "lucide-react"
import { useImportExcel, useListImportHistory, useRestoreImport } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"
import { ImportHistoryDialog } from "./ImportHistoryDialog"
import { cn } from "@/lib/utils"

export function FilterBar() {
  const filters = useFilterStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [historyOpen, setHistoryOpen] = React.useState(false)

  const importExcel = useImportExcel()
  const restoreImport = useRestoreImport()
  const { data: history } = useListImportHistory()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const res = await importExcel.mutateAsync({ data: { file } })
      if (res.success) {
        toast({
          title: "Успешный импорт",
          description: `Загружено кампаний: ${res.importedCampaigns}, размещений: ${res.importedPlacements}`,
          variant: "success",
        })
        queryClient.invalidateQueries()
      } else {
        toast({
          title: "Ошибка валидации",
          description: `Ошибок: ${res.errors.length}. Первые: ${res.errors.slice(0, 3).map(e => e.message).join(", ")}`,
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Ошибка загрузки",
        description: err.message || "Неизвестная ошибка",
        variant: "destructive",
      })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleUndoLast = async () => {
    if (!history || history.length === 0) {
      toast({ title: "Нет истории для отмены" })
      return
    }
    const lastImport = history[0] // Assuming sorted by date desc
    try {
      const res = await restoreImport.mutateAsync({ id: lastImport.id })
      if (res.success) {
        toast({
          title: "Загрузка отменена",
          description: `Восстановлено кампаний: ${res.restoredCampaigns}`,
          variant: "success",
        })
        queryClient.invalidateQueries()
      }
    } catch (err: any) {
      toast({
        title: "Ошибка отмены",
        description: err.message || "Неизвестная ошибка",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="sticky top-0 z-40 w-full bg-card border-b shadow-sm">
      <div className="flex flex-col p-4 gap-4 max-w-[1920px] mx-auto">
        <div className="flex flex-wrap items-center gap-3">
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx,.xls" 
            onChange={handleFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={importExcel.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <UploadIcon className="w-4 h-4 mr-2" />
            {importExcel.isPending ? "Загрузка..." : "Загрузить Excel"}
          </Button>
          
          <Button variant="outline" onClick={handleUndoLast} disabled={restoreImport.isPending || !history?.length} title="Отменить последнюю загрузку">
            <RotateCcwIcon className="w-4 h-4 mr-2" />
            Отменить последнюю
          </Button>

          <Button variant="ghost" onClick={() => setHistoryOpen(true)} title="История загрузок">
            <HistoryIcon className="w-4 h-4" />
          </Button>
          
          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !filters.date && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(new Date(filters.date), "dd.MM.yyyy", { locale: ru }) : "Дата"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(filters.date)}
                onSelect={(d) => d && filters.setDate(format(d, "yyyy-MM-dd"))}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <MultiSelect
            options={CITIES}
            selected={filters.cities}
            onChange={filters.setCities}
            placeholder="Все города"
            className="w-[200px]"
          />

          <Select value={filters.format || "all"} onValueChange={(v) => filters.setFormat(v === "all" ? null : v as any)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Все ТК" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ТК</SelectItem>
              <SelectItem value="ГМ">ГМ</SelectItem>
              <SelectItem value="СМ">СМ</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status || "all"} onValueChange={(v) => filters.setStatus(v === "all" ? null : v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Все статусы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="Платник">Платник</SelectItem>
              <SelectItem value="Не платник">Не платник</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Input 
            placeholder="Поиск по кампании" 
            className="w-[200px]"
            value={filters.searchCampaign}
            onChange={(e) => filters.setSearchCampaign(e.target.value)}
          />
          
          <Input 
            placeholder="Поиск по заказчику" 
            className="w-[200px]"
            value={filters.searchClient}
            onChange={(e) => filters.setSearchClient(e.target.value)}
          />

          <Select value={filters.campaignPhase} onValueChange={(v) => filters.setCampaignPhase(v as any)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кампании</SelectItem>
              <SelectItem value="planned">Запланировано</SelectItem>
              <SelectItem value="active">Опубликовано</SelectItem>
              <SelectItem value="finished">Завершено</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>
      
      <ImportHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
