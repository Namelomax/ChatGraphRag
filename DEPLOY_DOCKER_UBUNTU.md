# Ubuntu Docker deploy (web + RAG + Postgres + Redis + Ollama)

## 1) Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Relogin after group change.

## 2) Prepare project

```bash
git clone <your-repo-url> chatbot
cd chatbot
cp .env.docker.example .env.docker
```

Edit `.env.docker`:
- Set a strong `AUTH_SECRET`
- Set **`AUTH_URL` and `NEXTAUTH_URL` to the exact public origin** users open (including `http://` vs `https://`). Mismatch or `https` in env while users use plain HTTP causes redirect loops or ignored cookies.
- If you need a different model, change `LOCAL_OPENAI_MODEL` and pull it manually in Ollama (see below).

## 3) Start full stack

```bash
docker compose --env-file .env.docker up -d --build
```

`docker-compose.yml` maps **`127.0.0.1:3000 -> container :3000`** so **nginx can bind port 80** on the host without `Address already in use`.

## 4) Pull models manually in Ollama

```bash
docker exec -it chatbot-ollama-1 ollama pull qwen3:32b
docker exec -it chatbot-ollama-1 ollama pull nomic-embed-text
```

## 5) Nginx reverse proxy (recommended)

Example `/etc/nginx/sites-available/chatbot`:

```nginx
server {
    listen 80;
    server_name 185.242.118.145;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
    }
}
```

Then:

```bash
sudo ln -sf /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 6) Verify

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f rag-api
curl -I http://127.0.0.1:3000
```

Users reach the app at **`http://SERVER_IP`** (via nginx on port 80).

## 7) Open public access

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

## 8) Update after new commits

```bash
git pull
docker compose --env-file .env.docker up -d --build
```

## Local test with LM Studio (Windows host)

If LM Studio is already running on your host at `http://127.0.0.1:1234`, use the dedicated compose file:

```bash
cp .env.docker.lmstudio.example .env.docker.lmstudio
docker compose -f docker-compose.lmstudio.yml --env-file .env.docker.lmstudio up -d --build
```

This stack uses `host.docker.internal:1234/v1` from containers to reach LM Studio on the host.
