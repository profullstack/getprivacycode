declare global {
  const PRIVACYCODE_VERSION: string
  const PRIVACYCODE_CHANNEL: string
}

export const InstallationVersion = typeof PRIVACYCODE_VERSION === "string" ? PRIVACYCODE_VERSION : "local"
export const InstallationChannel = typeof PRIVACYCODE_CHANNEL === "string" ? PRIVACYCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
