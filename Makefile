.PHONY: install install-backend install-frontend install-extension setup run run-all dev dev-backend dev-frontend dev-extension ollama test test-backend test-frontend clean clean-backend clean-frontend clean-extension clean-all db-push db-reset docker-up docker-down help

# =================== INSTALL ===================

install: install-backend install-frontend install-extension
	@echo "All dependencies installed!"

install-backend:
	cd backend && npm install
	cd backend && npx prisma generate

install-frontend:
	cd frontend && npm install

install-extension:
	cd extension && npm install

# =================== SETUP ===================

setup: setup-backend
	@echo "Setup complete! Run 'make dev' to start all services."

setup-backend:
	@if [ ! -f backend/.env ]; then \
		echo "Creating backend/.env from template..."; \
		cp backend/.env.example backend/.env; \
	fi
	cd backend && npx prisma db push --accept-data-loss

# =================== RUN (Production) ===================

run: run-backend

run-backend:
	@if [ ! -f backend/.env ]; then \
		echo "Error: backend/.env not found. Run 'make setup' first."; \
		exit 1; \
	fi
	cd backend && npm start

run-frontend:
	cd frontend && npm run build && npm run preview

# =================== DEV (Development) ===================

ollama:
	@echo "Starting Ollama server (http://localhost:11434)..."
	@which ollama > /dev/null 2>&1 || (echo "Error: ollama not installed. Run: brew install ollama" && exit 1)
	ollama serve

dev:
	@echo "Starting all services..."
	@echo "Backend:  http://localhost:3000"
	@echo "Frontend: http://localhost:5173"
	@echo "Extension: Building in watch mode..."
	@make -j3 dev-backend dev-frontend dev-extension

dev-backend:
	@if [ ! -f backend/.env ]; then \
		echo "Error: backend/.env not found. Run 'make setup' first."; \
		exit 1; \
	fi
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

dev-extension:
	cd extension && npm run dev

build-extension:
	cd extension && npm run build
	@echo "Extension built → dist/ folder ready"
	@echo "Reload in Chrome: chrome://extensions → click refresh button"

db-push:
	cd backend && npx prisma db push

db-reset:
	cd backend && npx prisma db push --force-reset

docker-up:
	docker-compose up -d
	@echo "PostgreSQL running on localhost:5432"
	@echo "Adminer UI at http://localhost:8080"

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f postgres

test:
	cd backend && npm test

clean: clean-all

clean-all: clean-backend clean-frontend clean-extension

clean-backend:
	cd backend && rm -rf node_modules dist

clean-frontend:
	cd frontend && rm -rf node_modules dist

clean-extension:
	cd extension && rm -rf node_modules dist

help:
	@echo "================== QUICK START =================="
	@echo "First time:  make install && make setup && make dev"
	@echo ""
	@echo "Development (starts all 3 services):"
	@echo "  make dev              Start backend + frontend + extension"
	@echo "  make dev-backend      Backend only (localhost:3000)"
	@echo "  make dev-frontend     Frontend only (localhost:5173)"
	@echo "  make dev-extension    Extension watch mode"
	@echo ""
	@echo "Individual installs:"
	@echo "  make install-backend"
	@echo "  make install-frontend"
	@echo "  make install-extension"
	@echo ""
	@echo "Production:"
	@echo "  make run              Start backend only"
	@echo ""
	@echo "Database:"
	@echo "  make setup            Create .env and database"
	@echo "  make db-push          Update schema"
	@echo "  make db-reset         Reset database"
	@echo ""
	@echo "Docker (PostgreSQL):"
	@echo "  make docker-up        Start PostgreSQL container"
	@echo "  make docker-down      Stop containers"
	@echo ""
	@echo "LLM (Ollama) — required for AI features:"
	@echo "  make ollama           Start Ollama server (localhost:11434)"
	@echo "  One-time setup:  brew install ollama && ollama pull llama3"
	@echo ""
	@echo "Other:"
	@echo "  make clean-all        Remove all node_modules and dist"
	@echo "  make test             Run all tests"
	@echo "  make help             Show this help"
