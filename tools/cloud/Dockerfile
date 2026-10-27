FROM node:24.22.1-bookworm-slim

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN npm install --global pnpm@11.15.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
# Same install as the CI test job: the lockfile pins every tarball by integrity hash.
RUN pnpm install --frozen-lockfile --ignore-scripts
# Use the exact Playwright version from the lockfile, not a mismatched image tag.
# This explicit build step provisions browsers and OS libraries before runtime.
RUN pnpm exec playwright install --with-deps chromium-headless-shell
COPY . .
RUN chown -R node:node /app /ms-playwright
USER node
ENV AUTOMEDIA_CLOUD_SMOKE=1
CMD ["sh", "tools/cloud/smoke.sh"]
