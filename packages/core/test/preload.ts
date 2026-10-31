import path from "path"

process.env.PRIVACYCODE_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
process.env.PRIVACYCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.PRIVACYCODE_DISABLE_MODELS_FETCH = "true"
