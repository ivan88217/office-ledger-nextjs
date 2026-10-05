'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { EventImage } from '#/features/ledger/domain/event-images'

const ZOOM = 3
type Zoom = { width: number; height: number; x: number; y: number }
type Drag = { pointerId: number; x: number; y: number; left: number; top: number; moved: boolean }

export function ImageZoom({ image }: { image: EventImage }) {
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLImageElement>(null)
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  function toggleZoom(x?: number, y?: number) {
    suppressClick.current = false
    drag.current = null
    if (zoom) { setZoom(null); return }
    const bounds = picture.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    setZoom({ width: bounds.width, height: bounds.height,
      x: x === undefined ? bounds.width / 2 : x - bounds.left,
      y: y === undefined ? bounds.height / 2 : y - bounds.top })
  }

  useLayoutEffect(() => {
    const area = viewport.current
    if (!area) return
    area.scrollLeft = zoom ? Math.max(0, Math.min(zoom.x * ZOOM - area.clientWidth / 2, area.scrollWidth - area.clientWidth)) : 0
    area.scrollTop = zoom ? Math.max(0, Math.min(zoom.y * ZOOM - area.clientHeight / 2, area.scrollHeight - area.clientHeight)) : 0
  }, [zoom])

  const Icon = zoom ? ZoomOut : ZoomIn
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" aria-pressed={Boolean(zoom)} onClick={() => toggleZoom()}>
          <Icon className="mr-1 h-4 w-4" aria-hidden="true" />
          {zoom ? '縮小圖片' : '放大圖片'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {zoom ? '已放大 3 倍，可拖曳、捲動或使用方向鍵查看；再點一下圖片還原。' : '點一下圖片即可放大整張。'}
        </p>
      </div>
      <div ref={viewport} className="max-h-[60dvh] w-full overflow-auto overscroll-contain rounded-lg">
        <button
          type="button"
          aria-label={zoom ? '縮小整張圖片' : '放大整張圖片'}
          aria-pressed={Boolean(zoom)}
          className={cn('block w-fit border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            zoom ? 'max-w-none cursor-grab touch-none active:cursor-grabbing' : 'mx-auto max-w-full cursor-zoom-in')}
          onClick={(event) => {
            if (suppressClick.current) { suppressClick.current = false; return }
            toggleZoom(event.detail ? event.clientX : undefined, event.detail ? event.clientY : undefined)
          }}
          onPointerDown={(event) => {
            suppressClick.current = false
            if (!zoom || !event.isPrimary || event.button !== 0 || !viewport.current) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
              left: viewport.current.scrollLeft, top: viewport.current.scrollTop, moved: false }
          }}
          onPointerMove={(event) => {
            const start = drag.current
            const area = viewport.current
            if (!start || start.pointerId !== event.pointerId || !area) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) start.moved = true
            if (!start.moved) return
            area.scrollLeft = start.left - dx
            area.scrollTop = start.top - dy
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return
            suppressClick.current = drag.current.moved
            drag.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => { drag.current = null; suppressClick.current = false }}
          onLostPointerCapture={() => { drag.current = null }}
          onKeyDown={(event) => {
            const area = viewport.current
            if (!zoom || !area || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            area.scrollLeft += event.key === 'ArrowLeft' ? -40 : event.key === 'ArrowRight' ? 40 : 0
            area.scrollTop += event.key === 'ArrowUp' ? -40 : event.key === 'ArrowDown' ? 40 : 0
          }}
        >
          <img
            ref={picture}
            src={image.url}
            alt={image.fileName}
            draggable={false}
            className={cn('block select-none', zoom ? 'max-h-none max-w-none' : 'max-h-[60dvh] w-auto max-w-full object-contain')}
            style={zoom ? { width: zoom.width * ZOOM, height: zoom.height * ZOOM } : undefined}
          />
        </button>
      </div>
    </div>
  )
}
