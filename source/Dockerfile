FROM node:20-bookworm-slim

# Don't set NODE_ENV=production before building the client,
# or npm will skip devDependencies (vite) and your build will fail.
ENV NODE_ENV=development

# Runtime libs commonly needed by node-canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd --create-home --home-dir /app --shell /usr/sbin/nologin appuser

WORKDIR /app

############################
# CLIENT: copy + install + build
############################
WORKDIR /app/client

COPY client/package.json /app/client/package.json
COPY client/package-lock.json /app/client/package-lock.json
COPY client/vite.config.js /app/client/vite.config.js
COPY client/index.html /app/client/index.html
COPY client/eslint.config.js /app/client/eslint.config.js

COPY client/src /app/client/src
COPY client/public /app/client/public

# Force devDependencies so Vite exists
RUN npm ci --include=dev
RUN npm run build

############################
# SERVER: copy + install (prod only)
############################
WORKDIR /app/server

COPY server/package.json /app/server/package.json
COPY server/package-lock.json /app/server/package-lock.json

# Production-only server deps
RUN npm ci --omit=dev

COPY server/index.js /app/server/index.js
COPY server/Game.js /app/server/Game.js
COPY server/fonts /app/server/fonts
COPY server/tmp /app/server/tmp

COPY server/flag.txt /app/server/flag.txt

# Put built client output under server/public
RUN rm -rf /app/server/public && mkdir -p /app/server/public \
 && cp -r /app/client/dist/* /app/server/public/

# Now set production for runtime
ENV NODE_ENV=production

# Permissions
RUN mkdir -p /app/server/tmp \
 && chown -R appuser:appuser /app

USER appuser

EXPOSE 2026
WORKDIR /app/server
CMD ["node", "index.js"]
