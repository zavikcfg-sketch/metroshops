FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x start.sh && mkdir -p /app/data

ENV NODE_ENV=production \
    DATA_DIR=/app/data

EXPOSE 8080

CMD ["node", "app.js"]
