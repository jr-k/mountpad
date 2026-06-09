SHELL := /bin/bash

.PHONY: help dev dev-sqlite build build-dev test test-go test-front migrate seed-admin clean tidy

help:
	@echo 'Targets:'
	@echo '  dev          - start dev stack with PostgreSQL'
	@echo '  dev-sqlite   - start dev stack with SQLite'
	@echo '  build        - build production image'
	@echo '  build-dev    - build dev image'
	@echo '  tidy         - go mod tidy'
	@echo '  migrate      - run migrations via the binary'
	@echo '  seed-admin   - bootstrap admin from env'
	@echo '  clean        - remove build artefacts'

dev:
	docker compose -f docker-compose.dev.yml up --build

dev-sqlite:
	docker compose -f docker-compose.dev.sqlite.yml up --build

build:
	docker build --target prod -t mountpad:latest .

build-dev:
	docker build --target dev -t mountpad:dev .

tidy:
	go mod tidy

migrate:
	go run ./cmd/mountpad

seed-admin:
	go run ./cmd/mountpad

clean:
	rm -rf tmp/ frontend/dist
