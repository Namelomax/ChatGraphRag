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
- If you need a different model, change `LOCAL_OPENAI_MODEL` and `OLLAMA_CHAT_MODEL`

## 3) Start full stack

```bash
docker compose --env-file .env.docker up -d --build
```

## 4) Pull models manually in Ollama

```bash
docker exec -it chatbot-ollama-1 ollama pull qwen3:32b
docker exec -it chatbot-ollama-1 ollama pull nomic-embed-text
```

## 5) Verify

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f rag-api
```

The app is available at `http://SERVER_IP`.

## 6) Open public access

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

## 7) Update after new commits

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
