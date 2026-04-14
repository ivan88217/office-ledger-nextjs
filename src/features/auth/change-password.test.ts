import { describe, expect, it } from 'vitest'
import { validatePasswordChangeInput } from '#/features/auth/change-password'

describe('validatePasswordChangeInput', () => {
  it('接受合法的新舊密碼組合', () => {
    expect(() =>
      validatePasswordChangeInput({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-123',
      }),
    ).not.toThrow()
  })

  it('拒絕太短的新密碼', () => {
    expect(() =>
      validatePasswordChangeInput({
        currentPassword: 'old-password',
        newPassword: '12345',
        confirmPassword: '12345',
      }),
    ).toThrow('新密碼至少 6 字元')
  })

  it('拒絕新舊密碼相同', () => {
    expect(() =>
      validatePasswordChangeInput({
        currentPassword: 'same-password',
        newPassword: 'same-password',
        confirmPassword: 'same-password',
      }),
    ).toThrow('新密碼不可與目前密碼相同')
  })

  it('拒絕確認密碼不一致', () => {
    expect(() =>
      validatePasswordChangeInput({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-124',
      }),
    ).toThrow('新密碼與確認密碼不一致')
  })
})
