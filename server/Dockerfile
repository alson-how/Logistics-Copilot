FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev pango-dev
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm i --production=false || yarn || true
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache cairo-dev pango-dev
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
