import {
  listEventImages,
  requireEventImageAccess,
  uploadEventImage,
} from '#/features/ledger/server/event-images.service'
import {
  handleImageRequest,
  IMAGE_RESPONSE_HEADERS,
  readImageForm,
  requireSameOrigin,
} from '#/features/ledger/server/event-images.http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ eventId: string }> }

export async function GET(_request: Request, context: Context) {
  return handleImageRequest(async () => {
    const { eventId } = await context.params
    return Response.json({ images: await listEventImages(eventId) }, { headers: IMAGE_RESPONSE_HEADERS })
  })
}

export async function POST(request: Request, context: Context) {
  return handleImageRequest(async () => {
    requireSameOrigin(request)
    const { eventId } = await context.params
    await requireEventImageAccess(eventId, true)
    const file = await readImageForm(request)
    const image = await uploadEventImage(eventId, file)
    return Response.json({ image }, { status: 201, headers: IMAGE_RESPONSE_HEADERS })
  })
}
