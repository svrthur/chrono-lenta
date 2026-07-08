import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useListImportHistory, useRestoreImport } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

export function ImportHistoryDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useListImportHistory({
    query: {
      enabled: open,
      queryKey: ["/api/import-history"]
    }
  })
  
  const restoreImport = useRestoreImport()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleRestore = async (id: number) => {
    try {
      const res = await restoreImport.mutateAsync({ id })
      if (res.success) {
        toast({
          title: "Успешно",
          description: "Данные импорта восстановлены",
          variant: "success",
        })
        queryClient.invalidateQueries()
        onOpenChange(false)
      }
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message || "Не удалось восстановить",
        variant: "destructive"
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>История загрузок</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto mt-4 border rounded-md">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead>Дата и время</TableHead>
                <TableHead>Кампаний</TableHead>
                <TableHead>Размещений</TableHead>
                <TableHead>Файл</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Загрузка...</TableCell></TableRow>
              )}
              {!isLoading && (!history || history.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">История пуста</TableCell></TableRow>
              )}
              {history?.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.importedAt).toLocaleString("ru-RU")}</TableCell>
                  <TableCell>{entry.campaignCount}</TableCell>
                  <TableCell>{entry.placementCount}</TableCell>
                  <TableCell>{entry.filename || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleRestore(entry.id)}
                      disabled={restoreImport.isPending}
                    >
                      Восстановить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
