export const EQUALIZER_PRESETS = [
  { name: 'یکنواخت (Flat)', nameEn: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'تقویت بیس (Bass Boost)', nameEn: 'Bass Boost', gains: [7, 6, 4, 2, 0, -1, 0, 1, 2, 3] },
  { name: 'وکال و صدا (Vocal)', nameEn: 'Vocal Enhancer', gains: [-2, -1, 0, 2, 5, 5, 3, 1, 0, -1] },
  { name: 'الکترونیک و کلاب', nameEn: 'Electronic & Club', gains: [6, 5, 2, 0, -2, 2, 4, 5, 6, 5] },
  { name: 'راک و متال', nameEn: 'Rock & Metal', gains: [5, 4, 2, -1, -2, 0, 3, 5, 5, 4] },
  { name: 'کلاسیک و سنتی', nameEn: 'Classical & Acoustic', gains: [4, 3, 2, 1, -1, -1, 0, 2, 4, 4] },
  { name: 'جاز ملایم (Jazz)', nameEn: 'Smooth Jazz', gains: [3, 2, 0, 2, -1, -1, 0, 1, 3, 4] },
  { name: 'پاپ مدرن (Modern Pop)', nameEn: 'Pop Master', gains: [2, 3, 4, 2, 0, 1, 2, 4, 4, 3] }
];

export const FREQUENCY_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  .map(freq => ({ freq, label: freq >= 1000 ? `${freq / 1000}kHz` : `${freq}Hz` }));
