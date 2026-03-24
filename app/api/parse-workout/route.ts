import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_KEY })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const dataUrl = `data:${file.type};base64,${base64}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
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

  const text = response.choices[0].message.content ?? ''

  try {
    const data = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Could not parse response' }, { status: 500 })
  }
}
