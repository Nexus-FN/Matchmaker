FROM oven/bun:latest

WORKDIR /usr/src/app

COPY package*.json ./
COPY pnpm-lock*.yaml ./

RUN bun install

COPY . .

EXPOSE 3000
EXPOSE 8080

CMD [ "bun", "run", "src/index.ts" ]