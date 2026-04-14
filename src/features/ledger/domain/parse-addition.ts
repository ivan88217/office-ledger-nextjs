/**
 * 僅允許非負整數與 `+` 的加法算式，例如 `50 + 20 + 15`。
 */
export function parseAdditionExpressionToCents(raw: string): number {
  const s = raw.trim()
  if (!s) throw new Error('請輸入金額或算式')

  const tokens = s.split('+').map((t) => t.trim())
  let sum = 0
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) {
      throw new Error('僅支援非負整數與加號，例如：50 + 20')
    }
    const n = Number(tok)
    if (!Number.isSafeInteger(n)) throw new Error('數字過大')
    sum += n
    if (!Number.isSafeInteger(sum)) throw new Error('加總過大')
  }
  return sum
}
