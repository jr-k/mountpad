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
# VERSION is injected by the release pipeline (typically the git tag
# without its leading `v`). It lands in internal/version.Version via
# ldflags so the status bar can render it without a runtime lookup.
ARG VERSION=dev
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
    -ldflags="-s -w -X github.com/mountpad/mountpad/internal/version.Version=${VERSION}" \
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
# --chown on every COPY so the unprivileged runtime user owns the
# files end-to-end. Without it, COPY plants root-owned files even
# though the parent directory was chowned earlier, which causes
# permission denied on any later write (the inertia template
# fallback used to silently miss for this reason).
COPY --chown=mountpad:mountpad --from=backend-builder /out/mountpad /app/mountpad
COPY --chown=mountpad:mountpad --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY --chown=mountpad:mountpad migrations /app/migrations
USER mountpad
ENV MOUNTPAD_HTTP_ADDR=":4499" \
    MOUNTPAD_FRONTEND_DIST="/app/frontend/dist"
EXPOSE 4499
ENTRYPOINT ["/app/mountpad"]
