import type { PrivacyCodeAPI } from "./lib/types"

declare global {
  interface Window {
    privacycode: PrivacyCodeAPI
  }
}
