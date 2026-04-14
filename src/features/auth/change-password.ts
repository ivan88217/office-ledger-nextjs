type PasswordChangeInput = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export function validatePasswordChangeInput(input: PasswordChangeInput) {
  if (input.newPassword.length < 6) {
    throw new Error('新密碼至少 6 字元')
  }
  if (input.newPassword === input.currentPassword) {
    throw new Error('新密碼不可與目前密碼相同')
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new Error('新密碼與確認密碼不一致')
  }
}
