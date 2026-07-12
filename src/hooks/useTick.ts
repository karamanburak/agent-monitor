import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { tick } from '../store/sessionsSlice';

export function useTick() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(tick());
    const iv = window.setInterval(() => dispatch(tick()), 1000);
    return () => clearInterval(iv);
  }, [dispatch]);
}
