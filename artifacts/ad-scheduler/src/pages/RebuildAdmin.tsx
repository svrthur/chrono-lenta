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

// Инициализация темы при загрузке страницы
if (typeof window !== "undefined") {
  const savedTheme = localStorage.getItem("chrono-theme")
  if (savedTheme === "dark") {
    document.documentElement.classList.add("dark")
  } else if (savedTheme === "light") {
    document.documentElement.classList.remove("dark")
  }
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return document.documentElement.classList.contains("dark")
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  const toggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains("dark")
    if (nextDark) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("chrono-theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("chrono-theme", "light")
    }
    setIsDark(nextDark)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="h-6 px-2.5 text-[10.5px] font-medium inline-flex items-center gap-1 rounded-full glass-pill hover:opacity-90 transition-all cursor-pointer"
      title={isDark ? "Переключить на дневной режим" : "Переключить на ночной режим"}
    >
      {isDark ? (
        <>
          <Sun className="w-3 h-3 text-amber-400" />
          <span>День</span>
        </>
      ) : (
        <>
          <Moon className="w-3 h-3 text-indigo-600" />
          <span>Ночь</span>
        </>
      )}
    </button>
  )
}

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
    return
