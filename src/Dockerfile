FROM node:18-alpine3.16

RUN apk add nano

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node *.js ./
COPY --chown=node:node templates templates/

CMD [ "node", "index.js" ]

