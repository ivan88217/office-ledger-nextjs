import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageMagnifier } from './image-magnifier'

const image = { id: 'menu', fileName: '菜單.png', url: '/menu.png', createdAt: '2026-10-05T00:00:00Z' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup() {
  const { container } = render(<ImageMagnifier image={image} />)
  const picture = screen.getByRole('img', { name: '菜單.png' }) as HTMLImageElement
  vi.spyOn(picture, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 200))
  let captured = false
  picture.setPointerCapture = vi.fn(() => { captured = true })
  picture.hasPointerCapture = vi.fn(() => captured)
  picture.releasePointerCapture = vi.fn(() => { captured = false })
  return { picture, toggle: screen.getByRole('button', { name: '局部放大' }), lens: () => container.querySelector('[data-slot="magnifier-lens"]') as HTMLDivElement | null }
}

function pointer(target: HTMLElement, type: string, x: number, y: number, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperties(event, {
    pointerType: { value: pointerType }, pointerId: { value: 1 }, isPrimary: { value: true },
  })
  fireEvent(target, event)
}

describe('圖片局部放大', () => {
  it('開啟後以顯示圖片的座標呈現 3 倍細節，離開或關閉後隱藏', () => {
    const { picture, toggle, lens } = setup()
    pointer(picture, 'pointermove', 160, 120)
    expect(lens()).toBeNull()
    fireEvent.click(toggle)
    pointer(picture, 'pointermove', 160, 120)
    expect(lens()!.style.backgroundImage).toContain('/menu.png')
    expect(lens()!.style.backgroundSize).toBe('900px 600px')
    expect(lens()!.style.backgroundPosition).toBe('-360px -210px')
    expect(lens()!.style.left).toBe('60px')
    fireEvent.pointerOut(picture)
    expect(lens()).toBeNull()
    pointer(picture, 'pointermove', 160, 120)
    fireEvent.click(toggle)
    expect(lens()).toBeNull()
    expect(picture.tabIndex).toBe(-1)
  })

  it('手機按住拖曳可查看邊角，放開與取消時收起放大鏡', () => {
    const { picture, toggle, lens } = setup()
    fireEvent.click(toggle)
    pointer(picture, 'pointermove', 500, 500, 'touch')
    expect(lens()).toBeNull()
    pointer(picture, 'pointerdown', 160, 120, 'touch')
    expect(picture.setPointerCapture).toHaveBeenCalledWith(1)
    pointer(picture, 'pointermove', 500, 500, 'touch')
    expect(lens()!.style.left).toBe('120px')
    expect(lens()!.style.top).toBe('20px')
    expect(lens()!.style.backgroundPosition).toBe('-720px -420px')
    pointer(picture, 'pointerup', 500, 500, 'touch')
    expect(picture.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(lens()).toBeNull()
    pointer(picture, 'pointerdown', 160, 120, 'touch')
    fireEvent.pointerCancel(picture)
    expect(lens()).toBeNull()
  })

  it('可用方向鍵移動放大區域，失焦後收起', () => {
    const { picture, toggle, lens } = setup()
    fireEvent.click(toggle)
    expect(picture.tabIndex).toBe(0)
    fireEvent.focus(picture)
    expect(lens()!.style.backgroundPosition).toBe('-360px -210px')
    fireEvent.keyDown(picture, { key: 'ArrowRight' })
    expect(lens()!.style.backgroundPosition).toBe('-420px -210px')
    fireEvent.blur(picture)
    expect(lens()).toBeNull()
  })
})
