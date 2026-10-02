import { Storage } from '@google-cloud/storage'

let storage: Storage | undefined

function getBucket() {
  const bucketName = process.env.GCS_BUCKET
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!bucketName || !keyFilename) throw new Error('尚未設定圖片儲存空間')
  storage ??= new Storage({
    keyFilename,
    retryOptions: { maxRetries: 2, totalTimeout: 15 },
  })
  return storage.bucket(bucketName)
}

export async function saveEventImage(objectName: string, bytes: Buffer) {
  await getBucket()
    .file(objectName)
    .save(bytes, {
      resumable: false,
      contentType: 'image/webp',
      metadata: { cacheControl: 'private, no-store' },
      preconditionOpts: { ifGenerationMatch: 0 },
    })
}

export async function readEventImage(objectName: string) {
  const [bytes] = await getBucket().file(objectName).download()
  return bytes
}

export async function removeEventImage(objectName: string) {
  await getBucket().file(objectName).delete({ ignoreNotFound: true })
}
