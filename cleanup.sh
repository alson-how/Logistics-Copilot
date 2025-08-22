#!/bin/bash

echo "Stopping all Docker containers..."
docker-compose -f docker-compose.prod.yml down -v

echo "Removing all Docker containers using port 80..."
docker rm -f $(docker ps -q --filter publish=80)

echo "Checking processes using port 80..."
sudo lsof -i :80

echo "Stopping nginx if running..."
sudo systemctl stop nginx || true
sudo service nginx stop || true

echo "Double checking port 80..."
sudo netstat -tulpn | grep :80

echo "Cleaning up certbot files..."
sudo rm -rf /etc/letsencrypt/*
sudo rm -rf /var/lib/letsencrypt/*
sudo rm -rf /var/log/letsencrypt/*

echo "Creating required directories..."
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chown -R $USER:$USER /var/www/html

echo "Done! Port 80 should be free now."
