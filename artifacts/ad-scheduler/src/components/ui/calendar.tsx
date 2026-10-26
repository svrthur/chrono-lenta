import * as React from "react"
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfDay,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
]

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export type CalendarProps = {
  mode?: "single" | string
  selected?: Date
  onSelect?: (date: Date | undefined) => void
  disabled?:
    | boolean
    | Date
    | { before?: Date; after?: Date }
    | ((date: Date) => boolean)
  locale?: any
  initialFocus?: boolean
  className?: string
}

export function Calendar({
  selected,
  onSelect,
  disabled,
  className,
}: CalendarProps) {
  const [viewMonth, setViewMonth] = React.useState<Date>(() =>
    selected ? startOfMonth(selected) : startOfMonth(new Date())
  )

  React.useEffect(() => {
    if (selected) {
      setViewMonth(startOfMonth(selected))
    }
  }, [selected?.getTime()])

  const currentYear = viewMonth.getFullYear()
  const currentMonthIdx = viewMonth.getMonth()
  const years = React.useMemo(() => {
    const base = new Date().getFullYear()
    const arr: number[] = []
    for (let y = base - 3; y <= base + 5; y++) arr.push(y)
    if (!arr.includes(currentYear)) arr.push(currentYear)
    return arr.sort((a, b) => a - b)
  }, [currentYear])

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewMonth])

  const isDateDisabled = (day: Date): boolean => {
    if (!disabled) return false
    if (typeof disabled === "boolean") return disabled
    if (typeof disabled === "function") return disabled(day)
    if (disabled instanceof Date) return isSameDay(day, disabled)
    const dTime = startOfDay(day).getTime()
    if (disabled.before && dTime < startOfDay(disabled.before).getTime()) {
      return true
    }
    if (disabled.after && dTime > startOfDay(disabled.after).getTime()) {
      return true
    }
    return false
  }

  return (
    <div className={cn("p-3 w-[284px] select-none bg-popover text-popover-foreground", className)}>
      {/* Верхняя панель с удобными стрелками по краям и выбором месяца/года */}
      <div className="flex items-center justify-between gap-1 pb-2.5 mb-2 border-b">
        <button
          type="button"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded border bg-background hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title="Предыдущий месяц"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1">
          <select
            value={currentMonthIdx}
            onChange={(e) =>
              setViewMonth(new Date(currentYear, Number(e.target.value), 1))
            }
            className="h-7 rounded border bg-background px-1.5 text-xs font-semibold cursor-pointer focus:outline-none"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={currentYear}
            onChange={(e) =>
              setViewMonth(new Date(Number(e.target.value), currentMonthIdx, 1))
            }
            className="h-7 rounded border bg-background px-1.5 text-xs font-semibold cursor-pointer focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded border bg-background hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title="Следующий месяц"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Дни недели */}
      <div className="grid grid-cols-7 gap-1 mb-1 text-center">
        {WEEKDAYS.map((dayName, i) => (
          <div
            key={dayName}
            className={cn(
              "text-[11px] font-medium py-0.5",
              i >= 5 ? "text-red-500/80" : "text-muted-foreground"
            )}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Сетка чисел месяца */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false
          const isCurrentMonth = isSameMonth(day, viewMonth)
          const isTodayDate = isToday(day)
          const disabledDay = isDateDisabled(day)

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabledDay}
              onClick={() => onSelect?.(day)}
              className={cn(
                "h-8 w-8 rounded text-xs flex items-center justify-center transition-colors mx-auto",
                !isCurrentMonth && "text-muted-foreground/35",
                isCurrentMonth && !isSelected && "hover:bg-accent hover:text-accent-foreground",
                isTodayDate && !isSelected && "border border-primary text-primary font-bold",
                isSelected &&
                  "bg-primary text-primary-foreground font-bold shadow-2xs hover:bg-primary/90",
                disabledDay && "opacity-25 pointer-events-none"
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* Нижняя панель быстрого перехода на сегодня */}
      <div className="mt-2.5 pt-2 border-t flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            setViewMonth(startOfMonth(now))
            if (!isDateDisabled(now)) {
              onSelect?.(now)
            }
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Сегодня ({new Date().toLocaleDateString("ru-RU")})
        </button>

        {selected && (
          <span className="text-[11px] text-muted-foreground">
            Выбрано: {selected.toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
    </div>
  )
}

Calendar.displayName = "Calendar"
