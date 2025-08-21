#!/bin/bash

echo "Pulling latest changes..."
git pull

echo "Taking down containers..."
docker-compose -f docker-compose.prod.yml down

echo "Rebuilding and starting containers..."
docker-compose -f docker-compose.prod.yml up -d --build

echo "Cleaning up unused images..."
docker image prune -f

echo "Showing container status..."
docker-compose -f docker-compose.prod.yml ps

echo "Showing logs..."
docker-compose -f docker-compose.prod.yml logs --tail=50
