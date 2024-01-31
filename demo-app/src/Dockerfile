FROM node:18-slim

RUN apt update && apt install nano -y --no-install-recommends

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node *.js ./
COPY --chown=node:node pdfs pdfs/

USER root

CMD [ "node", "index.js" ]

