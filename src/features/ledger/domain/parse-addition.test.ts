import { describe, expect, it } from 'vitest'
import { parseAdditionExpressionToCents } from './parse-addition'

describe('parseAdditionExpressionToCents', () => {
  it('parses single integer', () => {
    expect(parseAdditionExpressionToCents('250')).toBe(250)
  })

  it('parses addition with spaces', () => {
    expect(parseAdditionExpressionToCents('50 + 20 + 15')).toBe(85)
  })

  it('rejects negative or operators other than +', () => {
    expect(() => parseAdditionExpressionToCents('10-5')).toThrow()
    expect(() => parseAdditionExpressionToCents('10 * 2')).toThrow()
  })

  it('rejects empty', () => {
    expect(() => parseAdditionExpressionToCents('')).toThrow()
    expect(() => parseAdditionExpressionToCents('   ')).toThrow()
  })
})
