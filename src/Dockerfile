FROM node:24-alpine

RUN apk add --no-cache openssl bash curl minio-client jq

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node *.js ./
COPY --chown=node:node templates templates/
COPY --chown=node:node tools tools/

EXPOSE 8080

CMD [ "node", "index.js" ]
