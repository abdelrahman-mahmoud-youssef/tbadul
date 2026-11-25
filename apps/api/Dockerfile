FROM node:26-slim

ENV CI=true \
    LEFTHOOK=0 \
    NODE_ENV=development

RUN npm install --global pnpm@12.16.1

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@engagement-exchange/api..." build

ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["sh", "-c", "pnpm --filter @engagement-exchange/db migrate && exec node dist/main.js"]
