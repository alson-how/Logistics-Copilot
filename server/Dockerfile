FROM node:20-alpine as build

# Install build dependencies
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev pango-dev

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# Install dependencies
RUN npm i --production=false || yarn || true

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache cairo-dev pango-dev

WORKDIR /app

# Copy built files and dependencies
COPY --from=build /app .

# Run TypeScript directly with tsx
CMD ["npx", "tsx", "src/index.ts"]