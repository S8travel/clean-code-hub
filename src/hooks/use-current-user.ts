import { useState, useEffect } from "react";

const STORAGE_KEY = "crm_current_user_email";

export function useCurrentUserEmail() {
  const [email, setEmailState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const setEmail = (val: string | null) => {
    if (val) {
      localStorage.setItem(STORAGE_KEY, val);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setEmailState(val);
  };

  useEffect(() => {
    const handler = () => {
      setEmailState(localStorage.getItem(STORAGE_KEY));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { email, setEmail };
}
