FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --production
COPY . .
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "index.js"]
