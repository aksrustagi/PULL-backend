# Procfile for Railway/Heroku deployment
# Main API service
web: pnpm start:api

# Background worker service (run separately)
worker: pnpm start:workers

# Release phase - run migrations
release: pnpm db:push
