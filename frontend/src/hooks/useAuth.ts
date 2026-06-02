import { useAuthContext } from "../context/AuthContext";

export function useAuth(): {
  user: ReturnType<typeof useAuthContext>["user"];
  token: string | null;
  status: ReturnType<typeof useAuthContext>["status"];
  error: string;
  bonusXPNotice: ReturnType<typeof useAuthContext>["bonusXPNotice"];
  dismissBonusXPNotice: ReturnType<typeof useAuthContext>["dismissBonusXPNotice"];
  login: ReturnType<typeof useAuthContext>["login"];
  register: ReturnType<typeof useAuthContext>["register"];
  logout: () => void;
  setCurrentUser: ReturnType<typeof useAuthContext>["setCurrentUser"];
} {
  return useAuthContext();
}
