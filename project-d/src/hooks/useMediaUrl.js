import { useEffect, useState } from 'react';
import { getMediaUrl } from '../db/mediaUrls.js';

export function useMediaUrl(id, directUrl = null) {
  const [state, setState] = useState({ id: null, url: null, error: null });

  useEffect(() => {
    if (directUrl || !id) return;
    let alive = true;

    getMediaUrl(id)
      .then((url) => {
        if (alive) setState({ id, url, error: null });
      })
      .catch((error) => {
        console.error('Failed to load media URL for id:', id, error);
        if (alive) setState({ id, url: null, error });
      });

    return () => {
      alive = false; // NO revoke here, cache handles lifecycle
    };
  }, [id, directUrl]);

  if (directUrl) return { url: directUrl, error: null, loading: false };
  if (!id) return { url: null, error: null, loading: false };
  if (state.id !== id) return { url: null, error: null, loading: true };
  return { url: state.url, error: state.error, loading: false };
}
