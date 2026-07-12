import { useCallback, useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { getUsage } from '../lib/api';
import { usageFailed, usageLoaded } from '../store/usageSlice';

export function useUsage() {
  const dispatch = useAppDispatch();
  const refresh = useCallback(async () => {
    try {
      dispatch(usageLoaded(await getUsage()));
    } catch {
      dispatch(usageFailed());
    }
  }, [dispatch]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 60000);
    return () => clearInterval(iv);
  }, [refresh]);

  return refresh;
}
