.PHONY: install install-backend install-frontend install-extension install-hooks setup run run-backend run-frontend dev dev-backend dev-frontend dev-extension ollama test test-fast test-backend test-extension test-extension-offline test-e2e check-stack build-extension clean clean-backend clean-frontend clean-extension clean-all db-push db-reset help

install: install-backend install-frontend install-extension install-hooks
	@echo "All dependencies installed!"

# Installs committed .githooks/pre-commit into .git/hooks (no husky / no git config).
install-hooks:
	@mkdir -p .git/hooks
	@cp .githooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit .githooks/pre-commit
	@echo "Git pre-commit hook installed (runs make test-fast)"

install-backend:
	cd backend && npm install
	cd backend && npx prisma generate

install-frontend:
	cd frontend && npm install

install-extension:
	cd extension && npm install

setup: setup-backend
	@echo "Setup complete! Run 'make dev' to start all services."

setup-backend:
	@if [ ! -f backend/.env ]; then \
		echo "Creating backend/.env from template..."; \
		cp backend/.env.example backend/.env; \
	fi
	cd backend && npx prisma db push --accept-data-loss

run: run-backend

run-backend:
	@if [ ! -f backend/.env ]; then \
		echo "Error: backend/.env not found. Run 'make setup' first."; \
		exit 1; \
	fi
	cd backend && npm start

run-frontend:
	cd frontend && npm run build && npm run preview

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

check-stack:
	node scripts/check-stack.js

test-backend:
	cd backend && npm test

# Offline only — safe for pre-commit (no live ATS / network).
test-extension:
	cd extension && npm test

test-extension-offline:
	cd extension && npm run test:offline

# Live Greenhouse / Lever / Ashby / Workday — run manually or in CI with secrets.
test-e2e:
	cd extension && npm run test:e2e

test-fast: check-stack test-backend test-extension

test: test-fast

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
	@echo "Development:"
	@echo "  make dev              Start backend + frontend + extension"
	@echo "  make dev-backend      Backend only (localhost:3000)"
	@echo "  make dev-frontend     Frontend only (localhost:5173)"
	@echo "  make dev-extension    Extension watch mode"
	@echo ""
	@echo "Database (SQLite):"
	@echo "  make setup            Create .env and database"
	@echo "  make db-push          Update schema"
	@echo "  make db-reset         Reset database"
	@echo ""
	@echo "LLM (Ollama):"
	@echo "  make ollama           Start Ollama (localhost:11434)"
	@echo "  One-time:  brew install ollama && ollama pull llama3.2"
	@echo ""
	@echo "Tests:"
	@echo "  make test / test-fast   Stack checks + backend Jest + offline portal mocks"
	@echo "  make test-extension-offline  Playwright fixtures (needs browsers)"
	@echo "  make test-e2e           Live ATS e2e (network; not in pre-commit)"
	@echo "  make install-hooks      Enable git pre-commit → make test-fast"
	@echo ""
	@echo "Other:"
	@echo "  make clean-all        Remove node_modules and dist"
	@echo "  make help             Show this help"
