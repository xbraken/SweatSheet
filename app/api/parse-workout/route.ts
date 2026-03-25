import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const mimeType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          {
            type: 'text',
            text: `Extract workout data from this Apple Fitness or Strava screenshot.
Return ONLY a JSON object with these fields (omit fields not visible):
- date: string (e.g. "Oct 15 Run")
- type: string (e.g. "Outdoor Run", "Strength Training")
- duration: string (e.g. "28:34")
- distance: string with unit (e.g. "5.2 KM") — only for cardio
- pace: string (e.g. "5:30 M/K") — only for runs
- calories: string (e.g. "320 CAL")
- heartRate: string (e.g. "142 BPM avg")

If this is not a workout screenshot, return {"error": "Not a workout screenshot"}.
Return only the JSON, no other text.`,
          },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const data = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('parse-workout error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
