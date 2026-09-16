// Иконки категорий — по id, не хранятся в БД (в схеме categories.icon
// зарезервирован под текстовый код на будущее, сейчас маппим на клиенте).
import { Scissors, Sparkles, Hand, Eye, Droplets, PenTool, Tag } from 'lucide-react-native';

export const CATEGORY_ICONS = {
  tattoo: PenTool,
  barber: Scissors,
  beauty: Sparkles,
  nails: Hand,
  lashes: Eye,
  massage: Droplets,
};

export function iconFor(categoryId) {
  return CATEGORY_ICONS[categoryId] || Tag;
}
