'use client'

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "#/lib/utils"
import { Button } from "#/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
}

export interface ComboboxRef {
  focus: () => void
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
  /** 當使用者輸入文字後按 Tab 或 Enter 時，是否自動選擇第一個符合的選項 */
  autoSelectFirstMatch?: boolean
  /** 選擇完成後要執行的 callback（用來 focus 下一個欄位） */
  onSelectComplete?: () => void
}

export const Combobox = React.forwardRef<ComboboxRef, ComboboxProps>(({
  options,
  value,
  onValueChange,
  placeholder = "選擇或搜尋...",
  emptyMessage = "找不到符合的結果。",
  className,
  disabled = false,
  autoSelectFirstMatch = true,
  onSelectComplete,
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  // 讓外部可以 focus 這個 Combobox，並自動開啟並 focus 輸入框
  React.useImperativeHandle(ref, () => ({
    focus: () => {
      setOpen(true)
      // 等待 Popover 開啟後 focus 內部輸入框
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    },
  }), [])

  // 當 popover 開啟時，如果是程式 focus 進來的，確保輸入框獲得焦點
  React.useEffect(() => {
    if (open && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [open])

  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    const term = searchValue.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(term)
    )
  }, [options, searchValue])

  const handleSelectFirstMatch = React.useCallback(() => {
    if (!autoSelectFirstMatch || filteredOptions.length === 0) return false

    const firstOption = filteredOptions[0]
    onValueChange?.(firstOption.value)
    setOpen(false)
    setSearchValue("")
    // 延遲一帧讓 Popover 完全關閉後再 focus 下一個元素
    requestAnimationFrame(() => {
      onSelectComplete?.()
    })
    return true
  }, [autoSelectFirstMatch, filteredOptions, onValueChange, onSelectComplete])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          {selectedOption ? selectedOption.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            ref={inputRef}
            placeholder="搜尋使用者..."
            value={searchValue}
            onValueChange={setSearchValue}
            onKeyDown={(e) => {
              if ((e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey) {
                if (handleSelectFirstMatch()) {
                  e.preventDefault()
                }
              }
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange?.(option.value)
                    setOpen(false)
                    setSearchValue("")
                    requestAnimationFrame(() => {
                      onSelectComplete?.()
                    })
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
})

Combobox.displayName = "Combobox"
