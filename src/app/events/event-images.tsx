'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Maximize2, Trash2 } from 'lucide-react'
import {
  EVENT_IMAGE_ACCEPT,
  MAX_EVENT_IMAGES,
  validateImageSelection,
  type EventImage,
} from '#/features/ledger/domain/event-images'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { ImageZoom } from '#/app/events/image-zoom'

async function responseBody<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error(body.message || '圖片操作失敗，請稍後再試')
  return body
}

export function EventImages({ eventId, isPayer }: { eventId: string; isPayer: boolean }) {
  const [images, setImages] = useState<EventImage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ file: File; message: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteImage, setDeleteImage] = useState<EventImage | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const requestVersion = useRef(0)
  const selected = images.find((image) => image.id === selectedId)

  const loadImages = useCallback(
    async (signal?: AbortSignal) => {
      if (busyRef.current) return
      const version = ++requestVersion.current
      try {
        const body = await responseBody<{ images: EventImage[] }>(
          await fetch(`/api/events/${eventId}/images`, { cache: 'no-store', signal }),
        )
        if (version !== requestVersion.current || signal?.aborted || busyRef.current) return
        setImages(body.images)
        setError(null)
      } catch (reason) {
        if (version !== requestVersion.current || signal?.aborted || busyRef.current) return
        setError(reason instanceof Error ? reason.message : '無法載入活動圖片')
      } finally {
        if (version === requestVersion.current && !signal?.aborted) setLoading(false)
      }
    },
    [eventId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadImages(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadImages(controller.signal)
    }, 10000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      requestVersion.current++
    }
  }, [loadImages])

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!isPayer || busyRef.current || !files.length) return
      if (files.length + images.length > MAX_EVENT_IMAGES) {
        setError(
          `每個活動最多可放 ${MAX_EVENT_IMAGES} 張圖片，目前還可新增 ${Math.max(0, MAX_EVENT_IMAGES - images.length)} 張`,
        )
        return
      }
      busyRef.current = true
      requestVersion.current++
      setBusy(true)
      setError(null)
      setFailed([])
      const failures: { file: File; message: string }[] = []
      for (const [index, file] of files.entries()) {
        setProgress(`正在上傳 ${index + 1}/${files.length}：${file.name}`)
        const invalid = validateImageSelection(file)
        if (invalid) {
          failures.push({ file, message: invalid })
          continue
        }
        try {
          const form = new FormData()
          form.append('image', file)
          const body = await responseBody<{ image: EventImage }>(
            await fetch(`/api/events/${eventId}/images`, { method: 'POST', body: form }),
          )
          setImages((current) => [...current.filter((image) => image.id !== body.image.id), body.image])
        } catch (reason) {
          failures.push({
            file,
            message: reason instanceof Error ? reason.message : '圖片上傳失敗，請稍後再試',
          })
        }
      }
      setFailed(failures)
      setProgress(
        failures.length ? `已完成，${failures.length} 張圖片未上傳` : `已上傳 ${files.length} 張圖片`,
      )
      busyRef.current = false
      setBusy(false)
      void loadImages()
    },
    [isPayer, images.length, eventId, loadImages],
  )

  useEffect(() => {
    if (!isPayer || loading) return
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || busyRef.current) return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]',
        )
      )
        return
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (!files.length) return
      event.preventDefault()
      void uploadFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isPayer, loading, uploadFiles])

  async function confirmDelete() {
    if (!deleteImage || !isPayer || busyRef.current) return
    busyRef.current = true
    requestVersion.current++
    setBusy(true)
    setError(null)
    try {
      await responseBody(await fetch(deleteImage.url, { method: 'DELETE' }))
      setImages((current) => current.filter((image) => image.id !== deleteImage.id))
      setDeleteImage(null)
      setProgress('已刪除圖片')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '圖片刪除失敗，請稍後再試')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>活動圖片</CardTitle>
          <span className="text-sm text-muted-foreground">
            {images.length}/{MAX_EVENT_IMAGES} 張
          </span>
        </div>
        <CardDescription>菜單、收據都可以放在這裡，點選圖片即可放大。結算後仍可補上收據。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPayer ? (
          <div
            className="rounded-xl border border-dashed border-[color:var(--line)] p-4 text-center"
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!loading) void uploadFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <input
              ref={inputRef}
              aria-label="選擇活動圖片"
              type="file"
              accept={EVENT_IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void uploadFiles(files)
              }}
              disabled={busy || loading}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading || images.length >= MAX_EVENT_IMAGES}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {busy ? '處理中…' : '上傳圖片'}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              可多選、拖曳，或在此頁按 ⌘V／Ctrl+V 貼上圖片。支援 JPEG、PNG、WebP，每張最多 10 MB。
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">圖片由付款人上傳及管理。</p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {progress && (
          <p role="status" className="break-all text-sm text-muted-foreground">
            {progress}
          </p>
        )}
        {failed.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="space-y-1">
                {failed.map(({ file, message }, index) => (
                  <li key={index} className="break-all">
                    {file.name}：{message}
                  </li>
                ))}
              </ul>
              {isPayer && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={busy}
                  onClick={() => void uploadFiles(failed.map(({ file }) => file))}
                >
                  重試失敗圖片
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            載入圖片中…
          </p>
        ) : images.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            還沒有圖片{isPayer ? '，先上傳菜單讓大家一起點餐吧。' : '。'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => (
              <div
                key={image.id}
                className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--line)]"
              >
                <button
                  type="button"
                  className="group relative block w-full bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setSelectedId(image.id)}
                  aria-label={`放大 ${image.fileName}`}
                >
                  <img
                    src={image.url}
                    alt={image.fileName}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-contain"
                  />
                  <Maximize2
                    aria-hidden="true"
                    className="absolute right-2 top-2 h-4 w-4 rounded bg-background/80 p-0.5"
                  />
                </button>
                <div className="flex items-center gap-1 p-2">
                  <p className="min-w-0 flex-1 truncate text-xs" title={image.fileName}>
                    {image.fileName}
                  </p>
                  {isPayer && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`刪除 ${image.fileName}`}
                      disabled={busy}
                      onClick={() => setDeleteImage(image)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && error && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void loadImages()}>
            重新載入圖片
          </Button>
        )}
      </CardContent>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl md:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-all pr-6">{selected?.fileName}</DialogTitle>
            <DialogDescription>點一下圖片可放大整張，再點一下還原；放大後可拖曳查看細節。</DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <ImageZoom key={selected.id} image={selected} />
              <Button variant="outline" asChild>
                <a href={selected.url} target="_blank" rel="noopener noreferrer">
                  開啟完整圖片
                </a>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteImage) && isPayer}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteImage(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除圖片？</DialogTitle>
            <DialogDescription className="break-all">
              {deleteImage?.fileName} 刪除後無法復原。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteImage(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? '刪除中…' : '確認刪除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
