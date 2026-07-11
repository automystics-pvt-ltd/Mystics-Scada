# Edge Gateway Agent — minimal image for plant-site deployment.
# No inbound ports are exposed: the agent only makes outbound HTTPS calls to
# the cloud API, so no inbound firewall rules or VPN are required on-site.
FROM node:20-alpine AS build
WORKDIR /app

# better-sqlite3 needs a native build toolchain
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev=false

COPY tsconfig.json build.mjs ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

VOLUME ["/app/data"]
ENV BUFFER_DB_PATH=/app/data/readings.db

CMD ["node", "dist/index.js"]
