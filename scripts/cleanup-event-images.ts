import { cleanupPendingEventImages } from '../src/features/ledger/server/event-images.service'
import { prisma } from '../src/lib/db/prisma'

try {
  const result = await cleanupPendingEventImages()
  console.log(`已清理 ${result.cleaned}/${result.attempted} 張圖片，仍有 ${result.remaining} 張待重試。`)
  if (result.remaining) process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
