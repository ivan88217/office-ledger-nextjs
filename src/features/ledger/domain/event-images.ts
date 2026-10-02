export const MAX_EVENT_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_EVENT_IMAGES = 20
export const EVENT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

export type EventImage = {
  id: string
  fileName: string
  createdAt: string
  url: string
}

export function validateImageSelection(file: { size: number; type: string }): string | null {
  if (file.size === 0) return '圖片檔案不可為空'
  if (file.size > MAX_EVENT_IMAGE_BYTES) return '每張圖片不可超過 10 MB'
  if (!EVENT_IMAGE_ACCEPT.split(',').includes(file.type)) return '請選擇 JPEG、PNG 或 WebP 圖片'
  return null
}
