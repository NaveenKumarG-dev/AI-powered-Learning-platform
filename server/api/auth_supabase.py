import os
import requests

from django.utils import timezone
from rest_framework import authentication, exceptions
from django.contrib.auth import get_user_model

User = get_user_model()


class SupabaseAuthentication(authentication.BaseAuthentication):
    """Authenticate requests using a Supabase access token.

    This implementation calls the Supabase `/auth/v1/user` endpoint with
    the provided bearer token to validate it and obtain user claims.
    """

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header:
            return None

        if header[0].lower() != b'bearer':
            return None

        if len(header) == 1:
            raise exceptions.AuthenticationFailed('Invalid token header. No credentials provided.')

        token = header[1].decode()

        supabase_url = os.environ.get('SUPABASE_PROJECT_URL') or os.environ.get('SUPABASE_URL') or os.environ.get('SUPABASE_PROJECT')
        if not supabase_url:
            raise exceptions.AuthenticationFailed('Supabase URL not configured')

        user_url = supabase_url.rstrip('/') + '/auth/v1/user'
        try:
            resp = requests.get(user_url, headers={'Authorization': f'Bearer {token}'}, timeout=5)
        except requests.RequestException:
            raise exceptions.AuthenticationFailed('Failed to verify Supabase token')

        if resp.status_code != 200:
            raise exceptions.AuthenticationFailed('Invalid or expired Supabase token')

        data = resp.json()
        supabase_id = data.get('id')
        email = data.get('email')
        if not supabase_id or not email:
            raise exceptions.AuthenticationFailed('Invalid Supabase user data')

        # Find local user by supabase_id, then by email
        user = None
        try:
            user = User.objects.filter(supabase_id=supabase_id).first()
        except Exception:
            user = None

        if not user:
            try:
                user = User.objects.filter(email=email).first()
            except Exception:
                user = None

        if not user:
            # Create a minimal local user profile
            full_name = data.get('user_metadata', {}).get('full_name') or data.get('name') or ''
            user = User.objects.create_user(email=email, full_name=full_name, password=None)
            user.supabase_id = supabase_id
            user.created_at = timezone.now()
            user.save()
        else:
            # Ensure supabase_id is stored
            if not user.supabase_id:
                user.supabase_id = supabase_id
                user.save()

        return (user, None)
