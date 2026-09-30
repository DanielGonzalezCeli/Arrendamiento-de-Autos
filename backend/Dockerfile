# Contexto de build = raíz del repositorio (el backend necesita contracts/autos-openapi.yaml).
#   docker build -f backend/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./
COPY contracts/ /app/contracts/
USER node
EXPOSE 3000
# Al arrancar: migraciones → seed idempotente (solo llena una BD vacía) → API.
# Si las migraciones fallan, el deploy falla y Render mantiene la versión anterior.
CMD ["sh", "-c", "npm run migration:run && npm run seed && node dist/main"]
