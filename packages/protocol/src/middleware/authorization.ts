import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { UnauthorizedError } from "../errors"

export class Authorization extends HttpApiMiddleware.Service<Authorization>()("@privacycode/HttpApiAuthorization", {
  error: UnauthorizedError,
}) {}
