import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../lib/supabaseClient';

export default function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const finalize = async () => {
      try {
        // Parse session from URL and store it
        // supabase.auth.getSessionFromUrl handles PKCE/redirect flow
        // @ts-ignore
        const { data, error } = await supabase.auth.getSessionFromUrl();
        if (error) {
          console.error('Supabase OAuth error', error);
          navigate('/login');
          return;
        }

        // At this point supabase stores the session client-side. Redirect to dashboard.
        navigate('/dashboard');
      } catch (e) {
        console.error(e);
        navigate('/login');
      }
    };

    finalize();
  }, [navigate]);

  return <div className="min-h-screen flex items-center justify-center">Finalizing sign-in...</div>;
}
