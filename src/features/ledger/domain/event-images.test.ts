import { describe, expect, it } from 'vitest'
import { MAX_EVENT_IMAGE_BYTES, validateImageSelection } from './event-images'

describe('活動圖片選檔', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('接受 %s 圖片', (type) => {
    expect(validateImageSelection({ size: 100, type })).toBeNull()
  })
  it('拒絕空檔案、過大圖片及非圖片', () => {
    expect(validateImageSelection({ size: 0, type: 'image/png' })).toContain('空')
    expect(validateImageSelection({ size: MAX_EVENT_IMAGE_BYTES + 1, type: 'image/png' })).toContain('10 MB')
    expect(validateImageSelection({ size: 100, type: 'application/pdf' })).toContain('JPEG')
    expect(validateImageSelection({ size: 100, type: 'image/svg+xml' })).toContain('JPEG')
  })
})
