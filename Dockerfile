FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 DATA_DIR=/data TRUST_PROXY=true
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server/index.js"]
