import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('_test_ping').select('*').limit(1)

    // A "relation does not exist" error still means the connection succeeded
    if (error && !error.message.includes('does not exist') && !error.message.includes('schema cache')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Supabase connection is working' })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
