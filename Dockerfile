# Dockerfile - 掼蛋游戏容器化部署
FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci --production

# 复制源码和静态文件
COPY server.js ./
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
