export const SESSION_COOKIE_NAME =
  typeof process !== 'undefined' && process.env.SESSION_COOKIE_NAME
    ? process.env.SESSION_COOKIE_NAME
    : 'office_ledger_session'

export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30
