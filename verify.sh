#!/bin/bash

DOMAIN=${1:-chatlah.tech}
echo "Verifying setup for domain: $DOMAIN"

echo -e "\n1. Checking DNS resolution..."
echo "Domain IP:"
dig +short $DOMAIN
echo "Current machine public IP:"
curl -s ifconfig.me

echo -e "\n2. Checking port 80 accessibility..."
nc -zv $DOMAIN 80

echo -e "\n3. Checking firewall rules..."
sudo ufw status

echo -e "\n4. Testing local port 80..."
curl -v localhost:80

echo -e "\n5. Testing domain..."
curl -v http://$DOMAIN

echo -e "\n6. Checking for any processes using port 80..."
sudo lsof -i :80

echo -e "\n7. Checking Docker networks..."
docker network ls
docker ps --format "{{.Names}}: {{.Ports}}"

echo -e "\n8. Testing with netcat server..."
echo "Starting netcat server on port 80 (will timeout after 5 seconds)..."
sudo timeout 5 nc -l -p 80 &
sleep 1
echo "Testing connection..."
curl -v localhost:80

echo -e "\nDone! Check the output above for any issues."
