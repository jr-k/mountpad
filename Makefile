SHELL := /bin/bash

.PHONY: help up up-postgres down dev build build-dev tidy clean

help:
	@echo 'Targets:'
	@echo '  up           - start production stack (SQLite, default)'
	@echo '  up-postgres  - start production stack with bundled Postgres'
	@echo '  down         - stop the production stack'
	@echo '  dev          - start dev stack (hot reload + Postgres)'
	@echo '  build        - build production image'
	@echo '  build-dev    - build dev image'
	@echo '  tidy         - go mod tidy'
	@echo '  clean        - remove build artefacts'

up:
	docker compose up -d --build

up-postgres:
	docker compose --profile postgres up -d --build

down:
	docker compose --profile postgres down

dev:
	docker compose -f docker-compose.dev.yml up --build

build:
	docker build --target prod -t mountpad:latest .

build-dev:
	docker build --target dev -t mountpad:dev .

tidy:
	go mod tidy

clean:
	rm -rf tmp/ frontend/dist
