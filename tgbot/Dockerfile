FROM golang:1.23-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /tgbot ./cmd/bot

FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=build /tgbot /app/tgbot

ENV PORT=8090

EXPOSE 8090

CMD ["/app/tgbot"]
