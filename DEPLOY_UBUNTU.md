# Развёртывание TwinGames на чистом Ubuntu VPS

Эта инструкция рассчитана на схему:

- `FRONTEND_DOMAIN` — Telegram Mini App;
- `ADMIN_DOMAIN` — админ-панель;
- backend, Telegram-бот и PostgreSQL работают только внутри Docker;
- наружу открыты только SSH `22`, HTTP `80` и HTTPS `443`;
- код обновляется через GitHub.

Во всех командах замени:

- `FRONTEND_DOMAIN` на реальный домен фронтенда, например `app.example.com`;
- `ADMIN_DOMAIN` на реальный домен админки, например `admin.example.com`;
- `YOUR_EMAIL` на почту для Let's Encrypt;
- `YOUR_REPOSITORY` на SSH-адрес репозитория GitHub.

## 1. До подключения к серверу

В панели DNS создай две записи типа `A`:

```text
FRONTEND_DOMAIN -> IPv4 VPS
ADMIN_DOMAIN    -> IPv4 VPS
```

Если у VPS нет настроенного IPv6, не создавай записи `AAAA`.

В сетевом firewall панели хостинга открой TCP-порты `22`, `80`, `443`.

## 2. Подключение к Ubuntu

```bash
ssh root@IP_СЕРВЕРА
```

Либо используй пользователя, которого выдал хостинг, и запускай команды через `sudo`.

## 3. Обновление сервера и базовые пакеты

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nano openssl ufw
```

## 4. Firewall

Сначала обязательно разреши SSH, иначе можно потерять доступ:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## 5. Установка Docker из официального репозитория

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc 2>/dev/null || true
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF_DOCKER
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF_DOCKER

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

## 6. Доступ VPS к GitHub

### Публичный репозиторий

```bash
sudo mkdir -p /opt/tg-mini-app
sudo chown "$USER":"$USER" /opt/tg-mini-app
cd /opt
git clone https://github.com/OWNER/REPOSITORY.git tg-mini-app
```

### Приватный репозиторий — рекомендуемый Deploy Key

На VPS:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "twingames-vps-deploy" -f ~/.ssh/twingames_deploy -N ""
cat ~/.ssh/twingames_deploy.pub
```

Скопируй показанный публичный ключ и добавь в GitHub:

```text
Repository -> Settings -> Deploy keys -> Add deploy key
```

Доступ на запись серверу не нужен.

Затем на VPS:

```bash
cat >> ~/.ssh/config <<'EOF_SSH'
Host github-twingames
    HostName github.com
    User git
    IdentityFile ~/.ssh/twingames_deploy
    IdentitiesOnly yes
EOF_SSH

chmod 600 ~/.ssh/config
ssh-keyscan github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
ssh -T git@github-twingames

cd /opt
git clone git@github-twingames:OWNER/REPOSITORY.git tg-mini-app
cd /opt/tg-mini-app
```

## 7. Замена старых DuckDNS-доменов в проекте

В текущей версии конфиги содержат старые домены. Выполни из корня проекта:

```bash
cd /opt/tg-mini-app

export FRONTEND_DOMAIN='app.example.com'
export ADMIN_DOMAIN='admin.example.com'

sed -i "s|tw1ngames\\.duckdns\\.org|$FRONTEND_DOMAIN|g" \
  docker-compose.yml .env.example README.md \
  nginx/default.conf nginx/default.bootstrap.conf nginx/default.ssl.conf \
  scripts/init-letsencrypt.sh

sed -i "s|tw1ngames2\\.duckdns\\.org|$ADMIN_DOMAIN|g" \
  docker-compose.yml .env.example README.md \
  nginx/default.conf nginx/default.bootstrap.conf nginx/default.ssl.conf \
  scripts/init-letsencrypt.sh

grep -R "tw1ngames.*duckdns" -n docker-compose.yml .env.example nginx scripts || true
```

Последняя команда в норме ничего не выводит.

## 8. Production `.env`

```bash
cd /opt/tg-mini-app
cp .env.example .env
nano .env
```

Пример содержимого:

```dotenv
PUBLIC_URL=https://FRONTEND_DOMAIN
PRIMARY_DOMAIN=FRONTEND_DOMAIN
ADMIN_DOMAIN=ADMIN_DOMAIN

NGINX_PORT=80
NGINX_SSL_PORT=443

CERTBOT_EMAIL=YOUR_EMAIL
DATA_PATH=./certbot

POSTGRES_USER=twingames
POSTGRES_PASSWORD=СЛОЖНЫЙ_СЛУЧАЙНЫЙ_ПАРОЛЬ
POSTGRES_DB=twingames

GIN_MODE=release
APP_ENV=docker
TELEGRAM_BOT_TOKEN=ТОКЕН_ОТ_BOTFATHER
BOT_MENU_TEXT=Играть
JWT_SECRET=ДЛИННЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ
JWT_TTL_HOURS=168
ALLOW_DEV_AUTH=false
CORS_ALLOW_ORIGINS=https://FRONTEND_DOMAIN

ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=СЛОЖНЫЙ_ПАРОЛЬ_АДМИНКИ
ADMIN_PASSWORD_HASH=
ADMIN_JWT_SECRET=ЕЩЁ_ОДИН_ДЛИННЫЙ_СЕКРЕТ
ADMIN_ALLOWED_ORIGINS=https://ADMIN_DOMAIN
```

Случайные значения можно получить так:

```bash
openssl rand -hex 32
openssl rand -hex 48
```

После сохранения:

```bash
chmod 600 .env
```

Никогда не коммить `.env` в GitHub.

## 9. Проверка production-сборки

```bash
cd /opt/tg-mini-app
sudo docker compose config >/dev/null
sudo docker compose build frontend admin backend tgbot
```

Если сборка завершилась без ошибки, переходи к базе.

## 10. База данных

### Вариант A: старая база потеряна или проект запускается с нуля

```bash
cd /opt/tg-mini-app
sudo docker compose up -d postgres
sudo docker compose ps

sudo docker compose exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backend/migrations/001_baseline.sql

sudo docker compose exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backend/migrations/002_admin.sql
```

### Вариант B: старая база существует

Данные пользователей не хранятся в GitHub. Нужен один из вариантов:

- доступ к старому VPS;
- файл `*.dump` или `*.sql`;
- адрес, логин, пароль и имя внешней PostgreSQL.

На старом сервере для PostgreSQL в Docker:

```bash
docker exec -t ИМЯ_POSTGRES_КОНТЕЙНЕРА \
  pg_dump -Fc -U ИМЯ_ПОЛЬЗОВАТЕЛЯ ИМЯ_БАЗЫ > twingames.dump
```

Передай файл на новый VPS:

```bash
scp twingames.dump root@IP_НОВОГО_VPS:/opt/tg-mini-app/
```

На новом VPS:

```bash
cd /opt/tg-mini-app
sudo docker compose up -d postgres
sudo docker compose exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < twingames.dump
```

После восстановления запусти backend: он выполнит совместимый `AutoMigrate` и добавит недостающие поля текущей модели.

## 11. Первый запуск и HTTPS

Убедись, что DNS обеих записей уже ведёт на VPS:

```bash
getent hosts FRONTEND_DOMAIN
getent hosts ADMIN_DOMAIN
```

Потом:

```bash
cd /opt/tg-mini-app
chmod +x scripts/init-letsencrypt.sh
sudo ./scripts/init-letsencrypt.sh
sudo docker compose up -d
sudo docker compose ps
```

Проверка:

```bash
curl -I https://FRONTEND_DOMAIN
curl https://FRONTEND_DOMAIN/health
curl -I https://ADMIN_DOMAIN
```

Ожидаемый health-ответ содержит `"status":"ok"` и `"database":"postgres"`.

## 12. Telegram

В BotFather укажи URL Mini App:

```text
https://FRONTEND_DOMAIN/
```

Тот же токен бота должен находиться в `TELEGRAM_BOT_TOKEN`.

## 13. Автопродление SSL

Открой root-cron:

```bash
sudo crontab -e
```

Добавь:

```cron
17 3 * * * cd /opt/tg-mini-app && /usr/bin/docker compose run --rm certbot renew --quiet && /usr/bin/docker compose exec -T nginx nginx -s reload >> /var/log/twingames-certbot.log 2>&1
```

## 14. Резервная копия PostgreSQL

Ручной backup:

```bash
sudo mkdir -p /var/backups/twingames
cd /opt/tg-mini-app
sudo docker compose exec -T postgres sh -c \
  'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > /var/backups/twingames/twingames-$(date +%F-%H%M).dump
```

Ежедневный backup через `sudo crontab -e`:

```cron
40 3 * * * cd /opt/tg-mini-app && mkdir -p /var/backups/twingames && /usr/bin/docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > /var/backups/twingames/twingames-$(date +\%F-\%H\%M).dump && find /var/backups/twingames -type f -name '*.dump' -mtime +14 -delete
```

## 15. Обновление проекта через GitHub

Сначала коммитишь и отправляешь изменения с компьютера в GitHub. Затем на VPS:

```bash
cd /opt/tg-mini-app
git pull --ff-only
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
sudo docker image prune -f
```

Если появились новые SQL-файлы в `backend/migrations`, применяй их по порядку перед окончательной проверкой.

## 16. Логи и диагностика

```bash
cd /opt/tg-mini-app
sudo docker compose ps
sudo docker compose logs --tail=150 backend
sudo docker compose logs --tail=150 nginx
sudo docker compose logs --tail=150 postgres
sudo docker compose logs --tail=150 tgbot
sudo docker compose logs -f backend
```

Перезапуск одного сервиса:

```bash
sudo docker compose restart backend
```

Пересборка одного сервиса:

```bash
sudo docker compose up -d --build backend
```

## 17. Команды, которые нельзя выполнять без backup

Не выполняй:

```bash
docker compose down -v
docker volume rm ...
docker system prune --volumes
```

Ключ `-v` удалит volume PostgreSQL вместе с данными.

## Архитектура проекта

```text
Интернет
   |
   | 80/443
   v
nginx container
   |-- FRONTEND_DOMAIN --> frontend container
   |-- ADMIN_DOMAIN    --> admin container
   |-- /api и /ws      --> backend container
                            |
                            v
                       postgres container

Telegram bot container также доступен backend/frontend через внутреннюю Docker-сеть.
```

Backend и PostgreSQL не имеют секции `ports`, поэтому напрямую из интернета недоступны. nginx обращается к ним по внутренним именам `backend:8080` и `postgres:5432`.
