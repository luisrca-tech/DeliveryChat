FROM oven/bun:alpine AS development-dependencies-env
COPY package.json bun.lockb /app/
COPY packages /app/packages
COPY apps/embed /app/apps/embed
WORKDIR /app
RUN bun install --frozen-lockfile

FROM oven/bun:alpine AS production-dependencies-env
COPY package.json bun.lockb /app/
COPY apps/embed/package.json /app/apps/embed/
WORKDIR /app
RUN bun install --frozen-lockfile --production

FROM oven/bun:alpine AS build-env
COPY package.json bun.lockb /app/
COPY packages /app/packages
COPY apps/embed /app/apps/embed
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app/apps/embed
RUN bun run build

FROM oven/bun:alpine
COPY package.json bun.lockb /app/
COPY apps/embed/package.json /app/apps/embed/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/apps/embed/build /app/apps/embed/build
WORKDIR /app/apps/embed
CMD ["bun", "run", "start"]