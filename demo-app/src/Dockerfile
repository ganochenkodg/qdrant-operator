FROM node:24-slim

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node *.js ./
COPY --chown=node:node pdfs pdfs/

CMD [ "node", "index.js" ]
