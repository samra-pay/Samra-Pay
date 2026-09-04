# Build ONLY with lib/launch-updates as the context, after artifact approval.
# Reuses the repository's existing base pin; a fresh image scan is still due.
FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e

WORKDIR /app
COPY --chown=node:node src/server.mjs src/resend.mjs src/connection-test.mjs ./src/

ENV NODE_ENV=production
ENV SAMRA_LAUNCH_UPDATES_MODE=disabled
USER node
ENTRYPOINT ["node", "./src/connection-test.mjs"]
