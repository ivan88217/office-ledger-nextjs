import { paymentTypeLabel } from './type-label'

type PeerLog = {
  type: string
  fromUserId: string
  toUserId: string
  note: string | null
}

type PeerLogPresentation = {
  title: string
  detail: string | null
  direction: 'incoming' | 'outgoing' | 'neutral'
}

export function describePeerLog(
  log: PeerLog,
  peer: { id: string; username: string },
): PeerLogPresentation {
  const fallback: PeerLogPresentation = {
    title: paymentTypeLabel(log.type), detail: null, direction: 'neutral',
  }
  if (log.fromUserId === log.toUserId) return fallback
  if (log.fromUserId !== peer.id && log.toUserId !== peer.id) return fallback

  const incoming = log.fromUserId === peer.id
  const from = incoming ? peer.username : '我'
  const to = incoming ? '我' : peer.username
  const direction = incoming ? 'incoming' : 'outgoing'

  switch (log.type) {
    case 'EXPENSE_DEBT':
      return {
        title: `${from}欠${to}`,
        detail: `新增欠款・${to}先代墊`, direction,
      }
    case 'SETTLEMENT':
      return {
        title: log.note === '預付款沖抵消費欠款'
          ? `${from}的預付款抵還欠款` : `${from}還${to}`,
        detail: `減少${from}對${to}的欠款`, direction,
      }
    case 'PREPAYMENT':
      return {
        title: `${from}預付給${to}`,
        detail: `增加${from}在${to}這邊的預付餘額`, direction,
      }
    case 'PREPAYMENT_REFUND':
      return {
        title: `${from}退還${to}的預付款`,
        detail: `減少${to}在${from}這邊的預付餘額`, direction,
      }
    case 'EXPENSE_PREPAY_APPLY':
      return {
        title: `以${from}的預付款支付`,
        detail: `消費扣抵${from}預付給${to}的餘額`, direction,
      }
    case 'SETTLEMENT_REVERSAL':
      return {
        title: `撤銷${from}的還款紀錄`,
        detail: `恢復${from}對${to}的欠款`, direction,
      }
    default:
      return fallback
  }
}
