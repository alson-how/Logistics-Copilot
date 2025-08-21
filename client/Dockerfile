FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm i || yarn || true
COPY . .
ENV HOST=0.0.0.0 PORT=5173
CMD ["npm", "run", "dev", "--", "--host"]
