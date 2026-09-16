// Нажатие на любом Pressable в приложении — по рецепту animate-expo:
// CSS-transition на transform, не setState-стиль вручную. 120мс/3% — потолок
// для элемента, по которому тычут десятки раз в день (шаг 1 гейта скилла):
// длиннее или крупнее уже не "почти незаметно". Reduced Motion гасит саму
// анимацию, а не фидбэк целиком — opacity остаётся откликом без transform.
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useReducedMotion } from '@/utils/useReducedMotion';

export default function PressableScale({ onPress, style, children, disabled, ...rest }) {
  const reducedMotion = useReducedMotion();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} pressRetentionOffset={16} {...rest}>
      {({ pressed }) => (
        <Animated.View
          style={[
            typeof style === 'function' ? style({ pressed }) : style,
            !reducedMotion && {
              transform: [{ scale: 1 }],
              transitionProperty: 'transform',
              transitionDuration: '120ms',
              transitionTimingFunction: 'ease-out',
            },
            pressed && !disabled && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}
