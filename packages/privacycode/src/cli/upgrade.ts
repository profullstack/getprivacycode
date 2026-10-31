import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@privacycode-ai/core/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@privacycode-ai/core/installation/version"
import semver from "semver"

// Check for PrivacyCode releases and leave the install choice to the user in /update.
export function shouldNotify(input: {
  autoupdate: boolean | "notify" | undefined
  disabled: boolean
  always: boolean
  current: string
  latest: string
}) {
  if (input.autoupdate === false || input.disabled) return false
  if (input.always) return true
  return Installation.isUpdate(input.current, input.latest)
}

// Returns undefined when checks are disabled, fail, or the installed release is current.
export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  if (config.autoupdate === false || Flag.PRIVACYCODE_DISABLE_AUTOUPDATE) return
  const latest = await Installation.latest(await Installation.method()).catch(() => {})
  if (!latest) return
  if (
    shouldNotify({
      autoupdate: config.autoupdate,
      disabled: Flag.PRIVACYCODE_DISABLE_AUTOUPDATE,
      always: Flag.PRIVACYCODE_ALWAYS_NOTIFY_UPDATE,
      current: InstallationVersion,
      latest,
    })
  )
    return { type: "available" as const, version: latest }
  if (
    semver.valid(InstallationVersion) &&
    semver.valid(latest) &&
    semver.gt(latest, InstallationVersion) &&
    Installation.getReleaseType(InstallationVersion, latest) === "major"
  )
    return { type: "major" as const }
}
