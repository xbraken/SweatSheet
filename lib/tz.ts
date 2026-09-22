import { cookies } from 'next/headers'
import { DEFAULT_TZ, TZ_COOKIE, isDateStr, isValidTz, todayIn } from './dates'

/** The user's IANA timezone, set by <TimezoneCookie /> on the client */
export async function getUserTz(): Promise<string> {
  const store = await cookies()
  const tz = store.get(TZ_COOKIE)?.value
  return isValidTz(tz) ? tz : DEFAULT_TZ
}

/** Today's date for the user — prefers a client-supplied date, falls back to the tz cookie */
export async function userToday(clientDate?: unknown): Promise<string> {
  if (isDateStr(clientDate)) return clientDate
  return todayIn(await getUserTz())
}
