'use client'

import { Download, PlusSquare, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'

const DISMISS_KEY = 'office-ledger-pwa-install-bubble-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function PwaInstallController() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [installed, setInstalled] = useState(false)
  const [open, setOpen] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedDismissed = window.localStorage.getItem(DISMISS_KEY) === '1'
    const standalone = isStandalone()
    setInstalled(standalone)
    setDismissed(storedDismissed)
    setShowIosHint(isIos() && !standalone)

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore registration failures; app remains usable without offline support.
      })
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
      if (window.localStorage.getItem(DISMISS_KEY) !== '1') {
        setOpen(true)
      }
    }

    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      window.localStorage.setItem(DISMISS_KEY, '1')
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (dismissed || installed || !showIosHint) return
    setOpen(true)
  }, [dismissed, installed, showIosHint])

  async function onInstall() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') {
      setPromptEvent(null)
      setDismissed(true)
      return
    }
    setDismissed(true)
  }

  function onDismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1')
    }
    setDismissed(true)
    setOpen(false)
  }

  if (installed) return null

  const canInstall = Boolean(promptEvent)
  const description = canInstall
    ? '可加入主畫面，之後直接從桌面或手機開啟。'
    : showIosHint
      ? '在 Safari 點分享，再選「加入主畫面」。'
      : '若瀏覽器支援安裝，可從網址列或瀏覽器選單加入應用程式。'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="h-10 w-10 rounded-xl"
          aria-label="安裝 OfficeLedger"
        >
          <Download className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[18rem] max-w-[calc(100vw-1rem)] rounded-xl border-[color:var(--line)] bg-[color:var(--surface-strong)] p-3 shadow-[0_18px_50px_rgba(23,58,64,0.16)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-[color:var(--sea-ink)]/8 p-2 text-[color:var(--sea-ink)]">
            {canInstall ? <Download className="h-4 w-4" /> : <PlusSquare className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[color:var(--sea-ink)]">安裝 OfficeLedger</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--sea-ink-soft)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1 text-[color:var(--sea-ink-soft)] transition hover:bg-black/5"
            aria-label="關閉安裝提示"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {canInstall ? (
          <Button className="mt-3 h-10 w-full" onClick={onInstall}>
            <Download className="mr-2 h-4 w-4" />
            立即安裝
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
