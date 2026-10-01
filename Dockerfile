# Static server for the getprivacycode.com marketing site.
# The Next.js marketing source lives outside this repo; we vendor the built
# export under ./site and serve it with serve.mjs, a zero-dependency server
# that runs on Bun (it only uses node:http/fs/path, so `node serve.mjs` works too).
# dev2's compose builds this file; nothing here installs packages.
FROM oven/bun:1.4.0-slim

WORKDIR /app
# dev2's checkout is group-only (files 660, dirs 2770), and COPY keeps those
# modes with root ownership, so the bun user could not read them. Own them.
COPY --chown=bun:bun serve.mjs ./serve.mjs
COPY --chown=bun:bun site ./site

ENV NODE_ENV=production
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
# PORT comes from the environment (dev2 compose sets 3000); serve.mjs falls back to 3000.
CMD ["bun", "serve.mjs"]
