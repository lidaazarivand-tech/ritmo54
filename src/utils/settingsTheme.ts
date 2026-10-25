// Keep the existing backup-compatible preference key and theme IDs.
export const THEME_KEY = 'lark_player_theme';
export const THEMES = [
  { id: 'obsidian', name: 'آبیِ تیره ریتمو', description: 'پوسته اصلی با آبی متالیک', accent: '#56A9DF', surface: '#141A23' },
  { id: 'cyber', name: 'آبیِ یخی', description: 'آبی روشن روی سطوح سرد و سرمه‌ای', accent: '#8CCBFF', surface: '#152139' },
  { id: 'emerald', name: 'فیروزه‌ای آرام', description: 'فیروزه‌ای روی سطوح سبزِ تیره', accent: '#73D5C2', surface: '#142720' },
  { id: 'velvet', name: 'بنفش مخملی', description: 'بنفش ملایم روی سطوح جوهری', accent: '#B9A1E8', surface: '#242034' },
  { id: 'platinum', name: 'ذغالی نقره‌ای', description: 'خاکستری خنثی و نقره‌ای', accent: '#BAC5D1', surface: '#23272C' },
  { id: 'amber', name: 'نارنجی مسی', description: 'نارنجی گرم و مسی', accent: '#E9A36A', surface: '#30231E' },
  { id: 'burgundy', name: 'زرشکی', description: 'زرشکی عمیق با هایلایت رز', accent: '#DE91A5', surface: '#2E1D26' },
  { id: 'bronze', name: 'طلایی قهوه‌ای', description: 'طلایی مات روی قهوه‌ای تیره', accent: '#D5BC83', surface: '#29251E' },
] as const;
export type ThemeId = typeof THEMES[number]['id'];
export function readTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeId {
  try {
    const id = storage.getItem(THEME_KEY);
    return THEMES.find(theme => theme.id === id)?.id || 'obsidian';
  } catch { return 'obsidian'; }
}
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.ritmoTheme = id;
}
export function selectTheme(id: ThemeId) {
  if (!THEMES.some(theme => theme.id === id)) throw new Error('پوسته معتبر نیست.');
  localStorage.setItem(THEME_KEY, id);
  applyTheme(id);
}
