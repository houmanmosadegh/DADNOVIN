import { useEffect } from "react";
import { useAuth } from "../stores/auth";

/** Login is unified — everyone signs in on the shared user-panel page
 *  (/panel), then staff are routed back here by role. */
export default function LoginPage() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      const cur = window.location.pathname + window.location.search;
      const back = cur && cur !== "/admin/login" ? `?next=${encodeURIComponent(cur)}` : "";
      window.location.assign(`/panel${back}`);
    }
  }, [user]);

  if (user) {
    window.location.assign("/admin/");
    return null;
  }
  return null;
}
