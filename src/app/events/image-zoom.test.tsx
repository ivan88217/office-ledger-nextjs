import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageZoom } from './image-zoom'

const image = { id: 'menu', fileName: '菜單.png', url: '/menu.png', createdAt: '2026-10-05T00:00:00Z' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup() {
  const { container } = render(<ImageZoom image={image} />)
  const picture = screen.getByRole('img', { name: '菜單.png' }) as HTMLImageElement
  const target = screen.getByRole('button', { name: '放大整張圖片' })
  const viewport = target.parentElement!
  vi.spyOn(picture, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 200))
  Object.defineProperties(viewport, {
    clientWidth: { value: 300 }, clientHeight: { value: 200 },
    scrollWidth: { value: 900 }, scrollHeight: { value: 600 },
  })
  target.setPointerCapture = vi.fn()
  target.hasPointerCapture = vi.fn(() => true)
  target.releasePointerCapture = vi.fn()
  return { container, picture, target, viewport }
}

function pointer(target: HTMLElement, type: string, x: number, y: number, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperties(event, {
    pointerType: { value: pointerType }, pointerId: { value: 1 }, isPrimary: { value: true },
  })
  fireEvent(target, event)
}

describe('整張圖片放大', () => {
  it('點一下圖片放大整張並保留點選位置，再點一下還原', () => {
    const { picture, target, viewport, container } = setup()
    fireEvent.click(target, { detail: 1, clientX: 160, clientY: 120 })
    expect(picture.style.width).toBe('900px')
    expect(picture.style.height).toBe('600px')
    expect(viewport.scrollLeft).toBe(300)
    expect(viewport.scrollTop).toBe(200)
    expect(screen.getByRole('button', { name: '縮小圖片' })).toBeTruthy()
    expect(container.querySelector('[data-slot="magnifier-lens"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '縮小整張圖片' }))
    expect(picture.style.width).toBe('')
    expect(viewport.scrollLeft).toBe(0)
    expect(viewport.scrollTop).toBe(0)
  })

  it.each(['mouse', 'touch'])('%s 拖曳移動整張圖片，拖曳結束不會誤觸縮小', (pointerType) => {
    const { picture, target, viewport } = setup()
    fireEvent.click(screen.getByRole('button', { name: '放大圖片' }))
    pointer(target, 'pointerdown', 160, 120, pointerType)
    pointer(target, 'pointermove', 100, 80, pointerType)
    expect(viewport.scrollLeft).toBe(360)
    expect(viewport.scrollTop).toBe(240)
    pointer(target, 'pointerup', 100, 80, pointerType)
    fireEvent.click(target)
    expect(picture.style.width).toBe('900px')
    pointer(target, 'pointerdown', 100, 80, pointerType)
    pointer(target, 'pointerup', 100, 80, pointerType)
    fireEvent.click(target)
    expect(picture.style.width).toBe('')
  })

  it('放大後可用方向鍵捲動，取消拖曳後仍可正常點選還原', () => {
    const { picture, target, viewport } = setup()
    fireEvent.click(screen.getByRole('button', { name: '放大圖片' }))
    fireEvent.keyDown(target, { key: 'ArrowRight' })
    expect(viewport.scrollLeft).toBe(340)
    fireEvent.keyDown(target, { key: 'ArrowDown' })
    expect(viewport.scrollTop).toBe(240)
    pointer(target, 'pointerdown', 160, 120, 'touch')
    pointer(target, 'pointermove', 100, 80, 'touch')
    fireEvent.pointerCancel(target)
    fireEvent.click(target)
    expect(picture.style.width).toBe('')
  })
})
