import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

export async function POST() {
  try {
    const sets = await db.execute('DELETE FROM sets')
    const cardio = await db.execute('DELETE FROM cardio')
    const blocks = await db.execute('DELETE FROM blocks')
    const sessions = await db.execute('DELETE FROM sessions')
    return NextResponse.json({
      ok: true,
      deleted: {
        sets: sets.rowsAffected,
        cardio: cardio.rowsAffected,
        blocks: blocks.rowsAffected,
        sessions: sessions.rowsAffected,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
