FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server/ ./server/
COPY public/ ./public/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/images', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server/index.js"]
