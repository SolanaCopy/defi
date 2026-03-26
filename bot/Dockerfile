FROM node:20-alpine
RUN apk add --no-cache fontconfig ttf-dejavu ttf-freefont
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY close-watcher.js .
COPY telegram-images.js .
COPY telegram-ai.js .
CMD ["node", "close-watcher.js"]
