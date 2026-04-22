export function paymentTypeLabel(type: string) {
  switch (type) {
    case 'EXPENSE_DEBT':
      return '消費欠款'
    case 'EXPENSE_PREPAY_APPLY':
      return '沖預付'
    case 'PREPAYMENT':
      return '預付款'
    case 'PREPAYMENT_REFUND':
      return '預付返還'
    case 'SETTLEMENT':
      return '還款'
    case 'SETTLEMENT_REVERSAL':
      return '沖銷還款'
    case 'ADJUSTMENT':
      return '調整'
    default:
      return type
  }
}
