import { describe, expect, it } from 'vitest'
import { describePeerLog } from './peer-log-presentation'

const peer = { id: 'peer', username: '小陳' }

describe('往來事件的閱讀視角', () => {
  it.each([
    ['EXPENSE_DEBT', 'peer', 'me', null, '小陳欠我', '新增欠款・我先代墊'],
    ['EXPENSE_DEBT', 'me', 'peer', null, '我欠小陳', '新增欠款・小陳先代墊'],
    ['SETTLEMENT', 'peer', 'me', null, '小陳還我', '減少小陳對我的欠款'],
    ['SETTLEMENT', 'me', 'peer', '還款', '我還小陳', '減少我對小陳的欠款'],
    ['PREPAYMENT', 'peer', 'me', null, '小陳預付給我', '增加小陳在我這邊的預付餘額'],
    ['PREPAYMENT', 'me', 'peer', null, '我預付給小陳', '增加我在小陳這邊的預付餘額'],
    ['PREPAYMENT_REFUND', 'peer', 'me', null, '小陳退還我的預付款', '減少我在小陳這邊的預付餘額'],
    ['PREPAYMENT_REFUND', 'me', 'peer', null, '我退還小陳的預付款', '減少小陳在我這邊的預付餘額'],
    ['EXPENSE_PREPAY_APPLY', 'peer', 'me', null, '以小陳的預付款支付', '消費扣抵小陳預付給我的餘額'],
    ['EXPENSE_PREPAY_APPLY', 'me', 'peer', null, '以我的預付款支付', '消費扣抵我預付給小陳的餘額'],
    ['SETTLEMENT', 'peer', 'me', '預付款沖抵消費欠款', '小陳的預付款抵還欠款', '減少小陳對我的欠款'],
    ['SETTLEMENT', 'me', 'peer', '預付款沖抵消費欠款', '我的預付款抵還欠款', '減少我對小陳的欠款'],
    ['SETTLEMENT_REVERSAL', 'peer', 'me', null, '撤銷小陳的還款紀錄', '恢復小陳對我的欠款'],
    ['SETTLEMENT_REVERSAL', 'me', 'peer', null, '撤銷我的還款紀錄', '恢復我對小陳的欠款'],
  ])('%s：%s → %s', (type, fromUserId, toUserId, note, title, detail) => {
    expect(describePeerLog({ type, fromUserId, toUserId, note }, peer)).toMatchObject({ title, detail })
  })

  it('切換登入者時使用對方姓名與「我」，不改變同一筆欠款的角色', () => {
    const log = { type: 'EXPENSE_DEBT', fromUserId: 'peer', toUserId: 'me', note: null }
    expect(describePeerLog(log, peer).title).toBe('小陳欠我')
    expect(describePeerLog(log, { id: 'me', username: '小林' }).title).toBe('我欠小林')
  })

  it.each([
    ['ADJUSTMENT', '調整'],
    ['FUTURE_TYPE', 'FUTURE_TYPE'],
  ])('對語意不明的 %s 保留中性描述', (type, title) => {
    expect(describePeerLog({ type, fromUserId: 'peer', toUserId: 'me', note: '人工備註' }, peer))
      .toEqual({ title, detail: null, direction: 'neutral' })
  })

  it('缺乏有效對象方向時不猜測誰欠誰', () => {
    const log = { type: 'EXPENSE_DEBT', fromUserId: 'someone', toUserId: 'else', note: null }
    expect(describePeerLog(log, peer).title).toBe('消費欠款')
    expect(describePeerLog({ ...log, fromUserId: 'peer', toUserId: 'peer' }, peer).direction).toBe('neutral')
  })
})
