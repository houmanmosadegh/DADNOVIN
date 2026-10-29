import { useEffect } from "react";
import { useAuth } from "../stores/auth";

/** Login is unified — everyone signs in on the public account page
 *  (/account), then staff are routed back here by role. */
export default function LoginPage() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      window.location.assign("/panel");
    }
  }, [user]);

  if (user) {
    window.location.assign("/admin/");
    return null;
  }
  return null;
}
