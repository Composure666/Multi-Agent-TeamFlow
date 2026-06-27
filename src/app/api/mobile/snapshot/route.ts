import type { NextRequest } from 'next/server'

import { mobileJson, mobileOptions } from '@/server/mobile-cors'
import { requireMobileAuth } from '@/server/mobile-auth'
import { getMobileSnapshot } from '@/server/mobile-service'

export const OPTIONS = mobileOptions

export async function GET(req: NextRequest) {
  const authError = requireMobileAuth(req)
  if (authError) return authError

  const snapshot = await getMobileSnapshot()
  return mobileJson(req, snapshot)
}
