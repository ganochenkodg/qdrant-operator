FROM node:18-alpine3.16

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev
COPY --chown=node:node *.js ./

CMD [ "node", "index.js" ]

