// Демо-данные для визуального переноса дизайна ("Salon Booking App" canvas).
// Пока не связано с Supabase — реальные категории/бизнесы/услуги придут из
// БД отдельным шагом (P0.5/P1.2). До тех пор экраны навигируемы и выглядят
// как в дизайне на этих статичных данных.
import { Scissors, Sparkles, Hand, Eye, Droplets, PenTool } from 'lucide-react-native';

export const TINTS = [
  ['#E3E7F5', '#CFD6EA'],
  ['#E8E6F0', '#D5D2E6'],
  ['#E2E9F0', '#CBD6E2'],
  ['#EDE9E6', '#DCD5CF'],
  ['#E6ECEA', '#CFDAD6'],
  ['#EAE7EE', '#D6D1DF'],
];

export const CATEGORIES = [
  { id: 'tattoo', name: 'Tattoo', count: '38 студий', icon: PenTool },
  { id: 'barber', name: 'Barber', count: '124 салона', icon: Scissors },
  { id: 'beauty', name: 'Beauty', count: '96 салонов', icon: Sparkles },
  { id: 'nails', name: 'Nails', count: '81 студия', icon: Hand },
  { id: 'lashes', name: 'Lashes', count: '52 студии', icon: Eye },
  { id: 'massage', name: 'Massage', count: '45 мест', icon: Droplets },
];

export const SALONS = [
  { name: 'Atelier Nizami', meta: 'Barber & Beauty · Ичеришехер · 1.2 км', rating: '4.9', reviews: '412', price: 45 },
  { name: 'Studio Mar', meta: 'Nails & Lashes · Насими · 2.4 км', rating: '4.8', reviews: '286', price: 30 },
  { name: 'Kaspi Ink', meta: 'Tattoo · Сахиль · 3.1 км', rating: '5.0', reviews: '147', price: 120 },
  { name: 'Beau Quartier', meta: 'Beauty · Ясамал · 4.0 км', rating: '4.7', reviews: '531', price: 38 },
  { name: 'Nardaran Spa', meta: 'Massage · Наримановский · 5.6 км', rating: '4.8', reviews: '203', price: 70 },
];

export const SERVICES = [
  { name: 'Мужская стрижка', dur: '45 мин', price: 45 },
  { name: 'Стрижка + борода', dur: '1 ч 10 мин', price: 65 },
  { name: 'Королевское бритьё', dur: '50 мин', price: 55 },
  { name: 'Детская стрижка', dur: '30 мин', price: 30 },
];

export const MASTERS = [
  { name: 'Тогрул', role: 'Barber', exp: '8 лет', rating: '4.9' },
  { name: 'Айсель', role: 'Stylist', exp: '6 лет', rating: '5.0' },
  { name: 'Камран', role: 'Barber', exp: '4 года', rating: '4.8' },
  { name: 'Нигяр', role: 'Colorist', exp: '9 лет', rating: '4.9' },
];

export const DATES = [
  { dow: 'Вс', num: '13', free: '3 слота' },
  { dow: 'Пн', num: '14', free: '8 слотов' },
  { dow: 'Вт', num: '15', free: '6 слотов' },
  { dow: 'Ср', num: '16', free: '—', off: true },
  { dow: 'Чт', num: '17', free: '9 слотов' },
  { dow: 'Пт', num: '18', free: '4 слота' },
  { dow: 'Сб', num: '19', free: '2 слота' },
  { dow: 'Вс', num: '20', free: '7 слотов' },
];

export const TIME_GROUPS = [
  { label: 'Утро', slots: ['09:00', '09:45', '10:30', '11:15'], off: ['09:45'] },
  { label: 'День', slots: ['12:00', '13:30', '14:15', '15:00', '15:45', '16:30'], off: ['13:30', '15:00'] },
  { label: 'Вечер', slots: ['17:15', '18:00', '18:45', '19:30'], off: ['18:45'] },
];

export const TODAY_LIST = SALONS.slice(0, 3).map((s, i) => ({
  ...s,
  sub: s.meta,
  first: ['17:30', '15:00', '19:15'][i],
  slots: [
    ['17:30', '18:15', '19:00'],
    ['15:00', '16:30', '18:00'],
    ['19:15', '20:00', '20:45'],
  ][i],
}));

export const UPCOMING = [
  {
    idx: 0,
    salon: 'Atelier Nizami',
    service: 'Стрижка + борода · 1 ч 10 мин',
    master: 'Тогрул',
    address: 'Ичеришехер',
    price: 65,
    when: 'Завтра, 14 сент · 18:00',
    status: 'Подтверждено',
  },
  {
    idx: 3,
    salon: 'Beau Quartier',
    service: 'Окрашивание · 2 ч',
    master: 'Нигяр',
    address: 'Ясамал',
    price: 140,
    when: 'Сб, 19 сент · 12:30',
    status: 'Ожидает салон',
  },
];

export const PAST = [
  { idx: 2, salon: 'Kaspi Ink', service: 'Тату-сеанс', when: '2 сент', rated: '5.0' },
  { idx: 1, salon: 'Studio Mar', service: 'Маникюр', when: '24 авг', rated: '4.5' },
  { idx: 0, salon: 'Atelier Nizami', service: 'Мужская стрижка', when: '16 авг', rated: '5.0' },
];
