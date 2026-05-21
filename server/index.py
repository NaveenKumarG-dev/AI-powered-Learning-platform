"""Vercel entrypoint for the Django backend.

Deploying from the `server/` directory keeps the frontend Vercel project
separate while exposing the Django WSGI application for this backend only.
"""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()