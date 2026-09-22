import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { fmtPr, fmtVolume, getRecap, isMonthStr } from '@/lib/recap'

await initDb()

/** GET ?month=YYYY-MM — 1080×1350 PNG recap card for sharing to stories / group chats */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = new URL(req.url).searchParams.get('month')
  if (!isMonthStr(month)) return NextResponse.json({ error: 'month=YYYY-MM required' }, { status: 400 })

  const r = await getRecap(session.userId, month)

  const stats: { label: string; value: string; color: string }[] = [
    { label: 'Sessions', value: String(r.sessions), color: '#e5e2e1' },
    ...(r.volumeKg > 0 ? [{ label: 'Lifted', value: fmtVolume(r.volumeKg, r.isLbs), color: '#ff9066' }] : []),
    ...(r.distanceKm > 0 ? [{ label: 'Distance', value: `${r.distanceKm} km`, color: '#4bdece' }] : []),
    { label: 'Best streak', value: `${r.longestStreak} day${r.longestStreak === 1 ? '' : 's'}`, color: '#e5e2e1' },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0e0e0e', padding: 80, color: '#e5e2e1', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 34, color: '#a48b83', letterSpacing: 4, textTransform: 'uppercase' }}>{r.username}&apos;s month</div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, marginTop: 8, color: '#ffb9a0' }}>{r.label}</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 64, gap: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', width: 448, background: '#201f1f', borderRadius: 32, padding: 36 }}>
              <div style={{ display: 'flex', fontSize: 80, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ display: 'flex', fontSize: 28, color: '#a48b83', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {r.prs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
            <div style={{ display: 'flex', fontSize: 30, color: '#a48b83', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>
              {r.prs.length} new PR{r.prs.length === 1 ? '' : 's'}
            </div>
            {r.prs.slice(0, 3).map(p => (
              <div key={p.exercise} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 40, padding: '10px 0' }}>
                <span>{p.exercise}</span>
                <span style={{ color: '#ff9066', fontWeight: 800 }}>{fmtPr(p, r.isLbs)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 900, color: '#ff9066' }}>SweatSheet</div>
          {r.prevSessions > 0 && (
            <div style={{ display: 'flex', fontSize: 30, color: '#a48b83' }}>
              {r.sessions >= r.prevSessions ? '+' : '-'}{Math.abs(r.sessions - r.prevSessions)} sessions vs last month
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  )
}
