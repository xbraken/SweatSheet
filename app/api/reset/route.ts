import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

export async function POST() {
  await db.executeMultiple(`
    DELETE FROM sets;
    DELETE FROM cardio;
    DELETE FROM blocks;
    DELETE FROM sessions;
  `)
  return NextResponse.json({ ok: true })
}
