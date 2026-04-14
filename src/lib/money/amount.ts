/** 金額以「分」為單位的整數，避免浮點誤差。 */
export type Cents = number & { readonly __brand: 'Cents' }

export function assertNonNegativeCents(n: number): asserts n is Cents {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('金額必須為非負整數（分）')
  }
}

export function toCents(n: number): Cents {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('金額必須為非負整數（分）')
  }
  return n as Cents
}

export function formatTwd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const frac = abs % 100
  return `${sign}$${dollars.toLocaleString('zh-TW')}.${frac.toString().padStart(2, '0')}`
}
