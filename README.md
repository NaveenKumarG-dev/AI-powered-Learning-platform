# AI-powered-Learning-platform

## Run Locally (no Docker)

This project can be run without Docker. Start the frontend using `npm` (Vite) and the backend with plain Python/Django.

Prerequisites

- Node >= 18 and npm
- Python >= 3.10
- MySQL (or update `server/settings.py` to use SQLite for local dev)

1) Install backend dependencies and prepare environment

```bash
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
cp server/.env.template server/.env
# Edit server/.env to set DB and AWS/Bedrock credentials
python server/manage.py migrate
python server/manage.py createsuperuser
python server/manage.py runserver 8000
```

2) Start frontend (Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`
Backend API: `http://localhost:8000/api`

Notes

- The backend reads AI config from `server/.env` — set `USE_BEDROCK_TEXT`/`USE_BEDROCK_IMAGE` and AWS credentials to enable Amazon Bedrock (defaults `amazon.nova-lite-v1:0` and `amazon.nova-canvas-v1:0`).
- Ollama support is preserved; set `OLLAMA_API_URL` / `OLLAMA_MODEL` in `server/.env` to use local Ollama for development.
