FROM node:22-bookworm-slim

WORKDIR /app

# Install backend dependencies
COPY ixitek-backend/package*.json ./ixitek-backend/
RUN npm ci --prefix ixitek-backend --omit=dev --no-audit --no-fund

# Install frontend dependencies
COPY ixitek-frontend/package*.json ./ixitek-frontend/
RUN npm ci --prefix ixitek-frontend --include=dev --no-audit --no-fund

# Copy application source
COPY ixitek-backend ./ixitek-backend
COPY ixitek-frontend ./ixitek-frontend

# Build React/Vite frontend
RUN npm run build --prefix ixitek-frontend

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "ixitek-backend/src/server.js"]
