# syntax=docker/dockerfile:1.6

# ---------- build stage ----------
FROM golang:1.26-alpine AS builder
WORKDIR /src

# Cache deps first so source edits don't blow the module cache.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Static, stripped binary. CGO off means a plain alpine runtime works.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- runtime stage ----------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 1000 app
WORKDIR /app
COPY --from=builder /out/server /app/server
USER app
EXPOSE 8080
ENV GIN_MODE=release \
    LOG_FORMAT=json
ENTRYPOINT ["/app/server"]
