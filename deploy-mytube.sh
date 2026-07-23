#!/bin/bash
# Deployment script for My-Tube on EC2
# Run this on the EC2 host.

echo "Pulling latest changes for feature/my-tube..."
git fetch
git checkout feature/my-tube
git pull origin feature/my-tube

echo "Setting up My-Tube environment..."
cat << EOF > .env.mytube
COMPOSE_PROJECT_NAME=mytube
WEB_PORT=8081
POSTGRES_USER=quietfeed
POSTGRES_PASSWORD=changeme
POSTGRES_DB=quietfeed
# NOTE: YOU MUST ADD YOUR NEW GOOGLE_CLIENT_ID HERE
EOF

echo "Starting Docker containers..."
docker compose --env-file .env.mytube up -d --build

echo "Configuring Nginx Reverse Proxy for my-tube.devopspractice.live..."
cat << 'EOF' | sudo tee /etc/nginx/conf.d/mytube.conf
server {
    listen 80;
    server_name my-tube.devopspractice.live;
    location / {
        proxy_pass http://localhost:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

sudo systemctl reload nginx

echo "Deployment complete! My-Tube should now be accessible at http://my-tube.devopspractice.live"
