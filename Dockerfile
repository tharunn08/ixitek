FROM node:22-alpine

WORKDIR /app

COPY ixitek-backend/package*.json ./ixitek-backend/
RUN npm ci --prefix ixitek-backend --omit=dev --no-audit --no-fund

COPY ixitek-frontend/package*.json ./ixitek-frontend/
RUN npm ci --prefix ixitek-frontend --include=dev --no-audit --no-fund

COPY ixitek-backend ./ixitek-backend
COPY ixitek-frontend ./ixitek-frontend

RUN npm run build --prefix ixitek-frontend

# npm is required only during the image build.
# Remove npm and npx from the production runtime image.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "ixitek-backend/src/server.js"]
