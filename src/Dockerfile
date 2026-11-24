FROM node:24-alpine

RUN apk add --no-cache openssl bash curl minio-client jq

RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN su -s /bin/sh node -c "npm ci --omit=dev" \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack
USER node

COPY --chown=node:node *.js ./
COPY --chown=node:node templates templates/
COPY --chown=node:node tools tools/

EXPOSE 8080

CMD [ "node", "index.js" ]
