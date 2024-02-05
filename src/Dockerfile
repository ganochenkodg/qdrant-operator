FROM node:18-alpine3.19

RUN apk add nano
RUN apk add openssl bash curl minio-client jq

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node *.js ./
COPY --chown=node:node templates templates/
COPY --chown=node:node tools tools/


CMD [ "node", "index.js" ]

