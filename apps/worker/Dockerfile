FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/openrouter/package.json ./packages/openrouter/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/storage/package.json ./packages/storage/package.json

RUN npm install

COPY . .

CMD ["npm", "run", "dev", "--workspace", "@openvideoui/worker"]
