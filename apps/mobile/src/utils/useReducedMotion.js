// По apple-design (п.14, Reduced Motion): включённая настройка "Уменьшение
// движения" не должна оставлять экран без обратной связи вообще — она
// убирает спринги/полёты/паралакс, но не сам факт "что-то произошло".
// Здесь используется только чтобы гасить длительность/задержку FadeIn на
// карточках и мгновенно завершать переход между Client/Business mode.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => mounted && setReduced(v));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
