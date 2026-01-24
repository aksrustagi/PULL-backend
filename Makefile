# ==============================================================================
# PULL Makefile
# ==============================================================================
# Common commands for development, building, testing, and deployment
# ==============================================================================

.PHONY: help install dev build test lint format clean docker temporal deploy

# Default target
.DEFAULT_GOAL := help

# ==============================================================================
# Variables
# ==============================================================================

PNPM := pnpm
DOCKER_COMPOSE := docker-compose -f infrastructure/docker-compose.yml
DOCKER_COMPOSE_PROD := docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml

# Colors for terminal output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# ==============================================================================
# Help
# ==============================================================================

help: ## Show this help message
	@echo ""
	@echo "$(CYAN)PULL Development Commands$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make $(GREEN)<target>$(RESET)\n\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 } \
		/^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Development

install: ## Install all dependencies
	$(PNPM) install

dev: ## Start development servers (all apps)
	$(PNPM) dev

dev-api: ## Start API server only
	$(PNPM) dev:api

dev-web: ## Start web app only
	$(PNPM) dev:web

dev-workers: ## Start Temporal workers only
	$(PNPM) dev:workers

##@ Building

build: ## Build all packages
	$(PNPM) build

build-api: ## Build API only
	$(PNPM) --filter @pull/api build

build-web: ## Build web app only
	$(PNPM) --filter @pull/web build

build-workers: ## Build Temporal workers only
	$(PNPM) --filter @pull/workers build

##@ Testing

test: ## Run all unit tests
	$(PNPM) test

test-watch: ## Run tests in watch mode
	$(PNPM) test -- --watch

test-coverage: ## Run tests with coverage report
	$(PNPM) test -- --coverage

test-e2e: ## Run E2E tests
	$(PNPM) test:e2e

test-e2e-ui: ## Run E2E tests with UI
	cd e2e && $(PNPM) exec playwright test --ui

test-integration: ## Run integration tests
	$(PNPM) test:integration

##@ Code Quality

lint: ## Run linter
	$(PNPM) lint

lint-fix: ## Run linter with auto-fix
	$(PNPM) lint:fix

format: ## Format code with Prettier
	$(PNPM) format

format-check: ## Check code formatting
	$(PNPM) format:check

typecheck: ## Run TypeScript type checking
	$(PNPM) typecheck

##@ Database

db-push: ## Push schema changes to Convex
	$(PNPM) db:push

db-dev: ## Start Convex development server
	$(PNPM) db:dev

db-codegen: ## Generate Convex types
	$(PNPM) --filter @pull/db codegen

##@ Docker

docker-up: ## Start Docker services
	$(DOCKER_COMPOSE) up -d

docker-down: ## Stop Docker services
	$(DOCKER_COMPOSE) down

docker-logs: ## View Docker logs
	$(DOCKER_COMPOSE) logs -f

docker-ps: ## List Docker containers
	$(DOCKER_COMPOSE) ps

docker-clean: ## Remove all Docker volumes and images
	$(DOCKER_COMPOSE) down -v --rmi all

docker-prod-up: ## Start production-like Docker stack
	$(DOCKER_COMPOSE_PROD) up -d

docker-prod-down: ## Stop production-like Docker stack
	$(DOCKER_COMPOSE_PROD) down

docker-build-api: ## Build API Docker image
	docker build -t pull-api -f apps/api/Dockerfile .

docker-build-workers: ## Build workers Docker image
	docker build -t pull-temporal-worker -f infrastructure/temporal/Dockerfile .

##@ Temporal

temporal-dev: ## Start local Temporal dev server
	temporal server start-dev

temporal-ui: ## Open Temporal UI (requires Docker)
	@echo "Opening Temporal UI at http://localhost:8080"
	@open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080 2>/dev/null || echo "Visit: http://localhost:8080"

temporal-namespace: ## Create Temporal namespace
	temporal namespace create pull --retention 7d

##@ Deployment

deploy-staging: ## Deploy to staging
	gh workflow run deploy-api.yml -f environment=staging
	gh workflow run deploy-web.yml -f environment=preview
	gh workflow run deploy-workers.yml -f environment=staging

deploy-production: ## Deploy to production (requires approval)
	@echo "$(YELLOW)Warning: This will deploy to production!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	gh workflow run deploy-api.yml -f environment=production
	gh workflow run deploy-web.yml -f environment=production
	gh workflow run deploy-workers.yml -f environment=production

deploy-contracts-testnet: ## Deploy contracts to testnet
	gh workflow run deploy-contracts.yml -f network=polygon-amoy -f contract=all

deploy-contracts-mainnet: ## Deploy contracts to mainnet (requires approval)
	@echo "$(YELLOW)Warning: This will deploy contracts to MAINNET!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	gh workflow run deploy-contracts.yml -f network=polygon-mainnet -f contract=all

##@ Infrastructure

tf-init: ## Initialize Terraform
	cd infrastructure/terraform && terraform init

tf-plan: ## Plan Terraform changes
	cd infrastructure/terraform && terraform plan -var-file=terraform.tfvars

tf-apply: ## Apply Terraform changes
	cd infrastructure/terraform && terraform apply -var-file=terraform.tfvars

tf-destroy: ## Destroy Terraform infrastructure
	@echo "$(YELLOW)Warning: This will destroy infrastructure!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	cd infrastructure/terraform && terraform destroy -var-file=terraform.tfvars

k8s-apply: ## Apply Kubernetes manifests
	kubectl apply -f infrastructure/kubernetes/

k8s-delete: ## Delete Kubernetes resources
	kubectl delete -f infrastructure/kubernetes/

##@ Utilities

clean: ## Clean all build artifacts and dependencies
	$(PNPM) clean
	rm -rf node_modules
	rm -rf apps/**/node_modules
	rm -rf packages/**/node_modules
	rm -rf apps/**/.next
	rm -rf apps/**/dist
	rm -rf packages/**/dist
	rm -rf coverage
	rm -rf e2e/playwright-report
	rm -rf e2e/test-results

reset: clean install ## Clean and reinstall everything

update-deps: ## Update all dependencies
	$(PNPM) update -i -r

check-deps: ## Check for outdated dependencies
	$(PNPM) outdated -r

audit: ## Run security audit
	$(PNPM) audit

generate-types: ## Generate all TypeScript types
	$(PNPM) --filter @pull/db codegen
	$(PNPM) --filter @pull/types build

##@ Git

pr: ## Create a pull request
	gh pr create --web

pr-status: ## Check PR status
	gh pr status

ci-status: ## Check CI status
	gh run list --limit 5

##@ Documentation

docs: ## Generate documentation
	$(PNPM) docs:generate

docs-serve: ## Serve documentation locally
	$(PNPM) docs:serve
