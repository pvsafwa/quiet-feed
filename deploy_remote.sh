ssh -i ~/my-ubuntu-key.pem -o StrictHostKeyChecking=no ubuntu@my-tube.devopspractice.live << 'EOSSH'
set -e
cd /home/ubuntu
if [ ! -d "my-tube" ]; then
  cp -r quiet-feed my-tube
fi
cd my-tube
git fetch
git checkout feature/my-tube
git pull origin feature/my-tube

# Setup .env
cp /home/ubuntu/quiet-feed/.env .env
sed -i 's/^WEB_PORT=.*/WEB_PORT=8082/' .env
# Remove any existing COMPOSE_PROJECT_NAME to avoid duplicates
sed -i '/^COMPOSE_PROJECT_NAME=/d' .env
echo "COMPOSE_PROJECT_NAME=mytube" >> .env

# Deploy Docker
docker compose up -d --build

# Setup Nginx
sudo bash -c "cat << 'INNEREOF' > /etc/nginx/sites-available/mytube
server {
    server_name my-tube.devopspractice.live;
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
}
INNEREOF"

sudo ln -sf /etc/nginx/sites-available/mytube /etc/nginx/sites-enabled/
sudo systemctl reload nginx

# Attempt Certbot (will fail if DNS isn't pointing to EC2 yet, but won't stop the script)
sudo certbot --nginx -d my-tube.devopspractice.live --non-interactive --agree-tos -m binabdulshukkur@gmail.com || true

EOSSH
