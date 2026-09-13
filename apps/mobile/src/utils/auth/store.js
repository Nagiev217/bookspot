// Единственный источник правды о состоянии авторизации в приложении.
// status: 'loading' (ещё не знаем) | 'signedOut' | 'signedIn'.
// role/businessId приходят с сервера (users/{uid}), а не придумываются
// клиентом. mode — это то, какой навигационный граф сейчас показан
// (client/business); отличается от role тем, что владелец бизнеса может
// добровольно переключиться в Client mode и обратно (см. concept, п.1).
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  status: 'loading',
  uid: null,
  role: null,
  businessId: null,
  mode: 'client',
  setAuth: (patch) => set(patch),
  setMode: (mode) => set({ mode }),
}));
