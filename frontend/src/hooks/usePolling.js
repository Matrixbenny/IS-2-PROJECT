import { useEffect, useRef } from 'react';

function usePolling(callback, intervalMs = 10000) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const timer = window.setInterval(() => callbackRef.current(), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
}

export default usePolling;
