import { useAuthContext } from "../context/AuthContext";

export function useAuth(): {
  user: ReturnType<typeof useAuthContext>["user"];
  token: string | null;
  status: ReturnType<typeof useAuthContext>["status"];
  error: string;
  logoutVersion: ReturnType<typeof useAuthContext>["logoutVersion"];
  bonusXPNotice: ReturnType<typeof useAuthContext>["bonusXPNotice"];
  dismissBonusXPNotice: ReturnType<typeof useAuthContext>["dismissBonusXPNotice"];
  clearError: ReturnType<typeof useAuthContext>["clearError"];
  login: ReturnType<typeof useAuthContext>["login"];
  register: ReturnType<typeof useAuthContext>["register"];
  logout: () => void;
  setCurrentUser: ReturnType<typeof useAuthContext>["setCurrentUser"];
} {
  return useAuthContext();
}
