# Static server for the getprivacycode.com marketing site.
# The Next.js marketing source lives outside this repo; we vendor the built
# export under ./site and serve it with a zero-dependency Node server.
FROM node:22-slim

WORKDIR /app
COPY serve.mjs ./serve.mjs
COPY site ./site

ENV NODE_ENV=production
# Railway injects PORT at runtime; serve.mjs falls back to 3000 locally.
CMD ["node", "serve.mjs"]
