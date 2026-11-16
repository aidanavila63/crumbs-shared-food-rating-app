'use client'
import { useEffect } from 'react'

// Third pass #4: the sign-in service can send an expired link back to the bare address with
// "#error_code=otp_expired". The landing page then opens the sign-in box with "That link expired".
export function ExpiredLinkRedirect() {
  useEffect(() => {
    if (/error_code=(otp_expired|access_denied)|error=access_denied/.test(window.location.hash))
      window.location.replace('/?signin=1&link=expired')
  }, [])
  return null
}
