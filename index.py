"""Vercel entrypoint for the Django application.

This keeps the existing `server/` project layout intact while making the
application importable from the repository root during Vercel deployments.
"""

from pathlib import Path
import os
import sys

ROOT_DIR = Path(__file__).resolve().parent
SERVER_DIR = ROOT_DIR / 'server'

if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()