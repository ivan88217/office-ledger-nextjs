'use client'

import { Laptop, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'office-ledger-theme'

function resolveTheme(preference: ThemePreference) {
  if (preference === 'light' || preference === 'dark') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference)
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0a1418' : '#173a40')
}

export function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initialPreference: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    setPreference(initialPreference)
    applyTheme(initialPreference)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      if ((window.localStorage.getItem(STORAGE_KEY) || 'system') === 'system') {
        applyTheme('system')
      }
    }

    media.addEventListener('change', onSystemThemeChange)
    return () => media.removeEventListener('change', onSystemThemeChange)
  }, [])

  function onPreferenceChange(value: string) {
    const nextPreference = value as ThemePreference
    setPreference(nextPreference)
    window.localStorage.setItem(STORAGE_KEY, nextPreference)
    applyTheme(nextPreference)
  }

  const Icon = preference === 'light' ? Sun : preference === 'dark' ? Moon : Laptop

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" className="h-10 w-10 rounded-xl" aria-label="切換主題">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={preference} onValueChange={onPreferenceChange}>
          <DropdownMenuRadioItem value="system">
            <Laptop className="mr-2 h-4 w-4" />
            跟隨系統
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            亮色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            深色
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
