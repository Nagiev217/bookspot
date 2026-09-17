// Нажатие на любом Pressable в приложении — по рецепту animate-expo:
// CSS-transition на transform, не setState-стиль вручную. 120мс/3% — потолок
// для элемента, по которому тычут десятки раз в день (шаг 1 гейта скилла):
// длиннее или крупнее уже не "почти незаметно". Reduced Motion гасит саму
// анимацию, а не фидбэк целиком — opacity остаётся откликом без transform.
//
// Анимируется сам Pressable (Animated.createAnimatedComponent), а не
// обёрточный View вокруг него: если style содержит flex/flexBasis (кнопки
// поровну делящие ширину ряда — см. "Перенести"/"Маршрут" в bookings.jsx),
// эти свойства должны стоять на элементе, который родитель реально видит
// как flex-ребёнка, иначе кнопка схлопывается до размера текста.
//
// pressed ведётся локальным useState (onPressIn/onPressOut), а не встроенным
// render-prop/function-style Pressable — при оборачивании в
// Animated.createAnimatedComponent style-как-функция не подхватывается
// Reanimated'ом и стили пропадают целиком; с обычным style-массивом всё
// работает, как и было задумано в рецепте animate-expo.
import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useReducedMotion } from '@/utils/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({ onPress, style, children, disabled, ...rest }) {
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      hitSlop={8}
      pressRetentionOffset={16}
      style={[
        resolvedStyle,
        !reducedMotion && {
          transform: [{ scale: 1 }],
          transitionProperty: 'transform',
          transitionDuration: '120ms',
          transitionTimingFunction: 'ease-out',
        },
        pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.9 },
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
