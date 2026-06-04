#!/usr/bin/env bash
# Local development setup script
# Run once after cloning the repo

set -e

echo "==> Building shared types..."
cd shared
npm install
npm run build
cd ..

echo "==> Installing backend dependencies..."
cd backend
npm install
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created backend/.env — edit it with your values"
fi
cd ..

echo "==> Installing frontend dependencies..."
cd frontend
npm install
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created frontend/.env — edit it with your values"
fi
cd ..

echo ""
echo "Setup complete."
echo ""
echo "To run in mock mode (no Dataverse required):"
echo "  cd backend && MOCK_CRM=true npm run dev"
echo "  cd frontend && npm run dev"
echo ""
echo "To seed Dataverse metadata tables:"
echo "  cd scripts && npx ts-node seed-crm-metadata.ts"
