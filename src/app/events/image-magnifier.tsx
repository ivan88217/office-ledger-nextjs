'use client'

import { useState, type PointerEvent } from 'react'
import { ZoomIn } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { EventImage } from '#/features/ledger/domain/event-images'

const ZOOM = 3
type Position = { x: number; y: number; width: number; height: number }

export function ImageMagnifier({ image }: { image: EventImage }) {
  const [enabled, setEnabled] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)

  function showPosition({ width, height }: DOMRect, x: number, y: number) {
    if (!width || !height) return
    setPosition({ x: Math.max(0, Math.min(x, width)), y: Math.max(0, Math.min(y, height)), width, height })
  }

  function followPointer(event: PointerEvent<HTMLImageElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    showPosition(bounds, event.clientX - bounds.left, event.clientY - bounds.top)
  }

  const size = position ? Math.min(180, position.width, position.height) : 0
  const sampleX = position ? Math.max(size / (2 * ZOOM), Math.min(position.x, position.width - size / (2 * ZOOM))) : 0
  const sampleY = position ? Math.max(size / (2 * ZOOM), Math.min(position.y, position.height - size / (2 * ZOOM))) : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={enabled ? 'secondary' : 'outline'}
          aria-pressed={enabled}
          onClick={() => { setEnabled((value) => !value); setPosition(null) }}
        >
          <ZoomIn className="mr-1 h-4 w-4" aria-hidden="true" />
          局部放大
        </Button>
        {enabled && <p className="text-xs text-muted-foreground">3 倍放大：移動滑鼠或按住圖片拖曳，也可聚焦圖片後使用方向鍵。</p>}
      </div>
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg">
        <img
          src={image.url}
          alt={image.fileName}
          draggable={false}
          tabIndex={enabled ? 0 : undefined}
          className={cn('block max-h-[60dvh] w-auto max-w-full object-contain outline-none focus-visible:ring-2 focus-visible:ring-ring', enabled && 'cursor-crosshair touch-none')}
          onPointerEnter={(event) => { if (enabled && event.pointerType === 'mouse') followPointer(event) }}
          onPointerDown={(event) => {
            if (!enabled || !event.isPrimary) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            followPointer(event)
          }}
          onPointerMove={(event) => {
            if (enabled && (event.pointerType !== 'touch' || event.currentTarget.hasPointerCapture(event.pointerId))) followPointer(event)
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            if (event.pointerType !== 'mouse') setPosition(null)
          }}
          onPointerLeave={() => setPosition(null)}
          onPointerCancel={() => setPosition(null)}
          onLostPointerCapture={() => setPosition(null)}
          onFocus={(event) => {
            if (!enabled) return
            const bounds = event.currentTarget.getBoundingClientRect()
            showPosition(bounds, bounds.width / 2, bounds.height / 2)
          }}
          onBlur={() => setPosition(null)}
          onKeyDown={(event) => {
            if (!enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault()
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = position?.x ?? bounds.width / 2
            const y = position?.y ?? bounds.height / 2
            showPosition(bounds,
              x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0),
              y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0))
          }}
        />
        {enabled && position && (
          <div
            data-slot="magnifier-lens"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white shadow-lg ring-2 ring-inset ring-white"
            style={{
              width: size,
              height: size,
              left: Math.max(0, Math.min(position.x - size / 2, position.width - size)),
              top: Math.max(0, Math.min(position.y - size / 2, position.height - size)),
              backgroundImage: `url(${JSON.stringify(image.url)})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${position.width * ZOOM}px ${position.height * ZOOM}px`,
              backgroundPosition: `${size / 2 - sampleX * ZOOM}px ${size / 2 - sampleY * ZOOM}px`,
            }}
          />
        )}
      </div>
    </div>
  )
}
