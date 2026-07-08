import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  className?: string
}

export function MultiSelect({ options, selected, onChange, placeholder, className }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => onChange(options)
  const clearAll = () => onChange([])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={cn("justify-between w-full font-normal", className)}
          role="combobox"
          aria-expanded={open}
        >
          <span className="truncate mr-2">
            {selected.length === 0 
              ? placeholder 
              : selected.length === options.length
              ? "Все города"
              : `${selected.length} выбрано`}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="flex flex-col max-h-[300px] overflow-auto p-1">
          <div className="flex items-center justify-between p-2 border-b mb-1">
            <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">Все</Button>
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">Очистить</Button>
          </div>
          {options.map((option) => (
            <div
              key={option}
              className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer"
              onClick={() => toggleOption(option)}
            >
              <Checkbox checked={selected.includes(option)} id={`ms-${option}`} className="pointer-events-none" />
              <label htmlFor={`ms-${option}`} className="text-sm font-medium leading-none cursor-pointer flex-1">
                {option}
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
