FROM node:20-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json* server/yarn.lock* server/pnpm-lock.yaml* ./
RUN npm i --production=false || yarn || true
COPY server/src ./src
COPY server/workflows ./workflows
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
