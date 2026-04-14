/** 將「整數元」轉為分（1 元 = 100 分） */
export function yuanToCents(yuan: number): number {
  if (!Number.isInteger(yuan) || yuan < 0) {
    throw new Error('請輸入非負整數（元）')
  }
  return yuan * 100
}
