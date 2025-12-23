#!/bin/bash
# Payme Smart - VPS Deployment Script
# Run as: bash setup.sh

set -e

echo "=== Payme Smart Deployment ==="

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

# 1. Install dependencies
echo -e "${GREEN}[1/6] Installing system dependencies...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - || true
sudo apt update
sudo apt install -y nodejs nginx

# Install PM2
sudo npm install -g pm2

# Install Puppeteer dependencies (for PDF generation)
sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libatspi2.0-0

# 2. Clone repository
echo -e "${GREEN}[2/6] Cloning repository...${NC}"
sudo mkdir -p /var/www
cd /var/www

if [ -d "payme_smart" ]; then
  echo "Directory exists, pulling latest..."
  cd payme_smart
  sudo git pull
else
  sudo git clone https://github.com/thevitaly/payme_smart.git
  cd payme_smart
fi

sudo chown -R $USER:$USER /var/www/payme_smart

# 3. Setup Backend
echo -e "${GREEN}[3/6] Setting up backend...${NC}"
cd /var/www/payme_smart/backend
npm install

# Create .env if not exists
if [ ! -f ".env" ]; then
  cat > .env << 'ENVEOF'
PORT=3006
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=migrator
PG_PASSWORD=Dabestis123_
PG_DATABASE=jvkpro

# Add your keys here:
# OPENAI_API_KEY=sk-...
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# GOOGLE_REDIRECT_URL=http://168.231.125.70/api/gmail/callback
# DROPBOX_ACCESS_TOKEN=...
ENVEOF
  echo "Created .env - please edit with your API keys!"
fi

# 4. Build Frontend
echo -e "${GREEN}[4/6] Building frontend...${NC}"
cd /var/www/payme_smart/frontend
npm install
npm run build

# 5. Setup PM2
echo -e "${GREEN}[5/6] Starting backend with PM2...${NC}"
cd /var/www/payme_smart/backend
pm2 delete payme-backend 2>/dev/null || true
pm2 start src/index.js --name payme-backend
pm2 save

# 6. Setup Nginx
echo -e "${GREEN}[6/6] Configuring Nginx...${NC}"
sudo cp /var/www/payme_smart/deploy/nginx-payme.conf /etc/nginx/sites-available/payme
sudo ln -sf /etc/nginx/sites-available/payme /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo "App available at: http://168.231.125.70"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your API keys"
echo "2. Restart: pm2 restart payme-backend"
echo ""
echo "Commands:"
echo "  pm2 logs payme-backend  - View logs"
echo "  pm2 restart payme-backend - Restart"
echo "  pm2 status - Check status"
