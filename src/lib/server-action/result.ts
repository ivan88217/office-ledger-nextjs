/**
 * Next.js 15 在 production 會把 Server Action 裡 `throw` 出的錯誤訊息
 * 遮罩成通用字串（「server side error occur」之類），以避免資訊洩漏。
 *
 * 為了讓呼叫端仍能拿到真正的錯誤原因，統一把 action 的回傳形態
 * 包成 `ActionResult<T>`：成功時帶 `data`，失敗時帶 `message`。
 *
 * 使用方式（server）：
 *   export async function fooAction(input: Input) {
 *     return runAction(async () => {
 *       const data = await service.doFoo(input)
 *       revalidatePath('/foo')
 *       return data
 *     })
 *   }
 *
 * 使用方式（client）：
 *   const result = await fooAction(input)
 *   if (!result.ok) {
 *     setError(result.message)
 *     return
 *   }
 *   useData(result.data)
 */

export type ActionSuccess<T> = { ok: true; data: T }
export type ActionFailure = { ok: false; message: string }
export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    // Server 端仍保留完整錯誤資訊供日誌除錯。
    console.error('[server-action-error]', err)
    const message =
      err instanceof Error && err.message ? err.message : '發生未預期的伺服器錯誤'
    return { ok: false, message }
  }
}
