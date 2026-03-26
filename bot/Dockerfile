FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY close-watcher.js .
COPY telegram-images.js .
COPY telegram-ai.js .
CMD ["node", "close-watcher.js"]
