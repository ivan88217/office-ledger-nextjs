import { deleteEventImage, getEventImage } from '#/features/ledger/server/event-images.service'
import {
  handleImageRequest,
  IMAGE_RESPONSE_HEADERS,
  requireSameOrigin,
} from '#/features/ledger/server/event-images.http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ eventId: string; imageId: string }> }

export async function GET(_request: Request, context: Context) {
  return handleImageRequest(async () => {
    const { eventId, imageId } = await context.params
    const bytes = await getEventImage(eventId, imageId)
    return new Response(new Uint8Array(bytes), {
      headers: { ...IMAGE_RESPONSE_HEADERS, 'Content-Type': 'image/webp' },
    })
  })
}

export async function DELETE(request: Request, context: Context) {
  return handleImageRequest(async () => {
    requireSameOrigin(request)
    const { eventId, imageId } = await context.params
    return Response.json(await deleteEventImage(eventId, imageId), { headers: IMAGE_RESPONSE_HEADERS })
  })
}
