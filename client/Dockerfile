FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm ci || yarn install --frozen-lockfile || true
COPY . .
# Accept build argument and set as environment variable for Vite
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
RUN npm install -g serve
ENV HOST=0.0.0.0
ENV PORT=5173
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]