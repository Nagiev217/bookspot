// Единственный источник правды о состоянии авторизации в приложении.
// status: 'loading' (ещё не знаем) | 'signedOut' | 'signedIn'.
// role/businessId приходят с сервера (users/{uid}), а не придумываются
// клиентом. mode — это то, какой навигационный граф сейчас показан
// (client/business/admin); отличается от role тем, что владелец бизнеса
// или admin может добровольно переключиться в Client mode и обратно.
// masterId — только у мастера (role 'staff'): чей это календарь.
// mustChangePassword — аккаунт выдан с временным паролем, его нужно сменить.
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  status: 'loading',
  uid: null,
  role: null,
  businessId: null,
  masterId: null,
  mustChangePassword: false,
  mode: 'client',
  setAuth: (patch) => set(patch),
  setMode: (mode) => set({ mode }),
}));
