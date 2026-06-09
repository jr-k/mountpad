# syntax=docker/dockerfile:1.7

# ---------- frontend builder ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --include=dev
COPY frontend/ ./
RUN npm run build

# ---------- backend builder ----------
FROM golang:1.23-alpine AS backend-builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/mountpad ./cmd/mountpad

# ---------- dev image (hot reload via Vite + air) ----------
FROM golang:1.23-alpine AS dev
WORKDIR /app
# air v1.61.7 works with Go 1.23+. Newer tags require Go 1.25.
RUN apk add --no-cache git curl nodejs npm \
 && go install github.com/air-verse/air@v1.61.7
ENV PATH="/go/bin:${PATH}"
EXPOSE 4499
CMD ["air", "-c", ".air.toml"]

# ---------- production image ----------
FROM alpine:3.20 AS prod
RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S mountpad && adduser -S -G mountpad -u 10001 mountpad \
 && mkdir -p /app /storage \
 && chown -R mountpad:mountpad /app /storage
WORKDIR /app
COPY --from=backend-builder /out/mountpad /app/mountpad
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY migrations /app/migrations
USER mountpad
ENV MOUNTPAD_HTTP_ADDR=":4499" \
    MOUNTPAD_FRONTEND_DIST="/app/frontend/dist"
EXPOSE 4499
ENTRYPOINT ["/app/mountpad"]
