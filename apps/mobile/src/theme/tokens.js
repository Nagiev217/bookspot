// Единственное место с токенами дизайна. В dersreport77 они переобъявлялись
// константами в каждом экране — не повторяем эту ошибку здесь.
// Стиль перенесён из дизайн-canvas "Salon Booking App" (Manrope, индиго-акцент).

export const COLORS = {
  indigo: '#3D4EDB',
  indigoDark: '#2C3ABF',
  indigo50: '#EEF0FF',
  indigo100: '#F5F6FF',
  ink: '#0B1120',
  text: '#0B1120',
  sub: '#8A93A6',
  subLight: '#A3AAB8',
  border: 'rgba(11,17,32,.08)',
  borderLight: 'rgba(11,17,32,.07)',
  surface: '#F4F5F9',
  surfaceAlt: '#F7F8FB',
  bg: '#EBEDF2',
  white: '#FFFFFF',
  star: '#F5A623',
  danger: '#D0412F',
  success: '#16A34A',
  warning: '#D97706',
};

// 8pt-сетка, кратно 4.
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 26 };

export const RADIUS = { sm: 11, md: 18, lg: 22, xl: 28, pill: 999 };

export const FONT = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

export const TEXT_SIZE = { xs: 11, sm: 12.5, md: 14, base: 15, lg: 17, xl: 22, xxl: 26 };
