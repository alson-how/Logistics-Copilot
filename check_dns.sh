#!/bin/bash

DOMAIN=${1:-chatlah.tech}
echo "Checking DNS configuration for: $DOMAIN"

echo -e "\n1. Current DNS Resolution:"
echo "Domain IP from DNS:"
dig +short $DOMAIN
echo "Current machine public IP:"
curl -s ifconfig.me
echo "Reverse DNS lookup:"
dig -x $(curl -s ifconfig.me)

echo -e "\n2. DNS Propagation Check:"
echo "Checking from multiple locations..."
curl -s "https://check-host.net/check-dns?host=$DOMAIN" | grep -o '"[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+"'

echo -e "\n3. DNS Records:"
echo "A Records:"
dig A $DOMAIN +noall +answer
echo "AAAA Records:"
dig AAAA $DOMAIN +noall +answer
echo "CNAME Records:"
dig CNAME $DOMAIN +noall +answer
echo "TXT Records:"
dig TXT $DOMAIN +noall +answer

echo -e "\n4. Checking HTTP Response:"
echo "Testing HTTP response from domain..."
curl -v -H "Host: $DOMAIN" http://$(dig +short $DOMAIN)/.well-known/acme-challenge/test

echo -e "\n5. Checking SSL Certificate (if any):"
echo "Testing SSL certificate..."
openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -text | grep "Subject:"

echo -e "\nRecommendations:"
if [ "$(dig +short $DOMAIN)" != "$(curl -s ifconfig.me)" ]; then
    echo "⚠️  WARNING: Domain IP does not match server IP!"
    echo "   - Domain points to: $(dig +short $DOMAIN)"
    echo "   - Server IP is: $(curl -s ifconfig.me)"
    echo "   Please update your DNS A record to point to: $(curl -s ifconfig.me)"
fi

echo -e "\nDone! Review the output above for any misconfigurations."
