FROM node:26-slim

ENV CI=true \
    LEFTHOOK=0 \
    NEXT_TELEMETRY_DISABLED=1

RUN npm install --global pnpm@12.16.1

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ARG API_ORIGIN
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm --filter "@engagement-exchange/web..." build

ENV NODE_ENV=production
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "next", "start"]
