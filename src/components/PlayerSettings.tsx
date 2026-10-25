import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Palette, FolderLock, Trash2, DatabaseBackup, MessageCircle, Info, Check, ShieldCheck, Download, Upload, Disc3, Search as SearchPreview, Play as PlayPreview } from 'lucide-react';
import { THEMES, ThemeId } from '../utils/settingsTheme';
import { MediaSettings } from '../utils/settingsMedia';
import { TrashItem } from '../utils/nativeMedia';
import { PlayerSkin } from './PlayerSkins';
import './PlayerSettings.css';

type Props = {
  options: readonly string[]; page: string | null; onPage: (page: string | null) => void; onBack: () => void;
  theme: ThemeId; onTheme: (theme: ThemeId) => void; themeError: string;
  playerSkin: PlayerSkin; onPlayerSkin: (skin: PlayerSkin) => void; playerArtwork: React.ReactNode;
  media: MediaSettings; mediaBusy: boolean; mediaError: string;
  trash: TrashItem[]; retentionDays: number; onRetention: (days: number) => void;
  onRestoreTrash: (token: string) => void; onPermanentTrash: (token: string) => void;
  renderTrashArtwork: (item: TrashItem) => React.ReactNode;
  onRestoreMedia: (kind: keyof MediaSettings, id: string) => void;
  onFeedback: () => Promise<void>;
  backupBusy: boolean; backupMessage: string; backupError: string; lastBackup: string;
  backupFileName: string; onBackupFileNameChange: (name: string) => void;
  onExport: () => void; onImport: () => void; version: string;
};
const metadata = [
  { title: 'پوسته', icon: Palette, description: 'ظاهر و هویت بصری Ritmo' },
  { title: 'پرونده‌های پنهان', icon: FolderLock, description: 'مدیریت رسانه‌های پنهان‌شده' },
  { title: 'اخیراً حذف‌شده', icon: Trash2, description: 'بررسی موارد حذف‌شده از برنامه' },
  { title: 'پشتیبان‌گیری و بازیابی', icon: DatabaseBackup, description: 'حفظ اطلاعات مهم و تنظیمات شما' },
  { title: 'بازخورد', icon: MessageCircle, description: 'پیشنهاد، انتقاد یا گزارش مشکل' },
  { title: 'درباره ما', icon: Info, description: 'اطلاعات برنامه و سازنده' },
];
const sections = [
  { title: 'ظاهر و تجربه', indices: [0] },
  { title: 'کتابخانه و داده‌ها', indices: [1, 2, 3] },
  { title: 'ارتباط و اطلاعات', indices: [4, 5] },
];
const stamp = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : 'هنوز پشتیبانی ایجاد نشده';

function EmptyState({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return <div className="ps-empty"><span className="ps-empty-icon"><Icon size={28} /></span><h2>{title}</h2><p>{children}</p><span className="ps-note"><ShieldCheck size={16} />بدون تغییر در اطلاعات و فایل‌های شما</span></div>;
}
function Block({ icon: Icon, title, description, children }: { icon: typeof Info; title: string; description?: string; children: React.ReactNode }) {
  return <section className="ps-block"><div className="ps-block-heading"><span className="ps-icon"><Icon size={20} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{children}</section>;
}

export function PlayerSettings(p: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const restoreFocus = useRef<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; if (focused?.isConnected) focused.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
    if (firstRender.current) { firstRender.current = false; return; }
    const previous = !p.page ? Array.from(pageRef.current?.querySelectorAll<HTMLButtonElement>('.ps-row') || []).find(button => button.getAttribute('aria-label') === restoreFocus.current) : undefined;
    if (previous) previous.focus({ preventScroll: true });
    else pageRef.current?.querySelector<HTMLHeadingElement>('h1')?.focus({ preventScroll: true });
  }, [p.page]);
  const entry = metadata.find(item => item.title === p.page);
  const sendFeedback = async () => {
    if (feedbackBusy) return;
    setFeedbackBusy(true); setFeedbackError('');
    try { await p.onFeedback(); }
    catch { setFeedbackError('برنامه ایمیل باز نشد. می‌توانید به azarivandadel@gmail.com ایمیل بفرستید.'); }
    finally { setFeedbackBusy(false); }
  };
  const status = (title: string) => {
    if (title === 'پوسته') return THEMES.find(theme => theme.id === p.theme)?.name || '';
    if (title === 'پرونده‌های پنهان') return `${p.media.hidden.length.toLocaleString('fa-IR')} آهنگ پنهان`;
    if (title === 'اخیراً حذف‌شده') return `${(p.media.deleted.length + p.trash.length).toLocaleString('fa-IR')} مورد`;
    if (title === 'پشتیبان‌گیری و بازیابی') return p.lastBackup ? `آخرین پشتیبان: ${stamp(p.lastBackup)}` : 'پشتیبان ثبت نشده';
    if (title === 'درباره ما') return `نسخه ${p.version}`;
    return 'عادل آذری وند';
  };
  return <dialog ref={dialog} className="ritmo-settings" dir="rtl" aria-label={p.page || 'تنظیمات'} onCancel={event => { event.preventDefault(); p.onBack(); }}>
    <div ref={pageRef} className="ps-scroll">
      <div className="ps-shell">
        <header className="ps-header">
          <div className="ps-topline"><span className="ps-brand"><Disc3 size={16} />Ritmo / {p.page ? 'تنظیمات' : 'تجربه شما'}</span><button disabled={p.backupBusy} className="ps-back" aria-label={p.page ? 'بازگشت به تنظیمات' : 'بستن تنظیمات'} onClick={p.onBack}><ArrowRight size={20} /></button></div>
          <h1 tabIndex={-1}>{p.page || 'تنظیمات'}</h1>
          <p>{p.page ? entry?.description : 'شخصی‌سازی و مدیریت تجربه Ritmo'}</p>
        </header>
        <div key={p.page || 'root'} className="ps-content">
          {!p.page ? sections.map(section => <section className="ps-section" key={section.title} aria-label={section.title}><h2>{section.title}</h2><div className="ps-list">{section.indices.map(index => {
            const item = metadata[index]; const Icon = item.icon;
            if (!p.options.includes(item.title)) return null;
            return <button className="ps-row" key={item.title} aria-label={item.title} onClick={() => { restoreFocus.current = item.title; p.onPage(item.title); }}>
              <span className="ps-icon"><Icon size={21} /></span><span className="ps-row-copy"><strong>{item.title}</strong><span>{item.description}</span><small className="ps-status">{status(item.title)}</small></span><ChevronLeft className="ps-arrow" size={18} />
            </button>;
          })}</div></section>) : <>
            {p.page === 'پوسته' && <>
              <Block icon={Palette} title="رنگ‌بندی برنامه" description="رنگ‌بندی بلافاصله اعمال و برای ورود بعدی ذخیره می‌شود."><div className="ps-theme-list" role="group" aria-label="پوسته‌های ریتمو">{THEMES.map(theme => <button key={theme.id} className="ps-theme-choice" aria-pressed={p.theme === theme.id} onClick={() => p.onTheme(theme.id)}><span className="ps-app-preview" style={{ '--preview-surface': theme.surface, '--preview-accent': theme.accent } as React.CSSProperties} aria-hidden="true"><span className="ps-preview-header"><Disc3 size={13} /><b>Ritmo</b><SearchPreview /></span><span className="ps-preview-tabs"><i /><i /><i /></span><span className="ps-preview-song"><i /><span><b>آهنگ‌های من</b><small>کتابخانه موسیقی</small></span><PlayPreview /></span><span className="ps-preview-player"><i /><span /><PlayPreview /></span></span><span className="ps-theme-caption"><strong>{theme.name}</strong><small>{theme.description}</small>{p.theme === theme.id && <Check size={18} />}</span></button>)}</div>{p.themeError && <p role="alert" className="ps-message ps-error">{p.themeError}</p>}</Block>
            </>}
            {p.page === 'اخیراً حذف‌شده' && <>
              <label className="ps-retention">نگهداری خودکار
                <select aria-label="مدت نگهداری اخیراً حذف‌شده" disabled={p.mediaBusy || p.backupBusy} value={p.retentionDays} onChange={e => p.onRetention(Number(e.target.value))}>{[7, 30, 60, 90].map(days => <option key={days} value={days}>{days.toLocaleString('fa-IR')} روز</option>)}</select>
              </label>
              <p className="ps-detail">نسخه امن بازیابی فقط تا پایان مدت نگهداری حفظ می‌شود. پاک‌سازی هنگام شروع یا بازگشت به برنامه انجام می‌شود؛ حذف دائمی برگشت‌پذیر نیست. تغییر مدت، روی موارد موجود هم اعمال می‌شود.</p>
              {p.mediaError && <p role="alert" className="ps-message ps-error">{p.mediaError}</p>}
              {!p.trash.length && !p.media.deleted.length && <EmptyState icon={Trash2} title="موردی برای بازیابی وجود ندارد">آهنگ‌های حذف‌شده اینجا نمایش داده می‌شوند.</EmptyState>}
              {p.trash.map(item => <section className="ps-trash-item" key={item.token}>
                <div className="ps-trash-heading">{p.renderTrashArtwork(item)}<div><h2>{item.title || item.fileName}</h2><p>{item.artist || 'خواننده ناشناس'}</p>
                  <small>{item.status === 'copying' ? 'نسخه‌برداری قطع شده؛ فایل ناقص برای بررسی حفظ شده و بازیابی تضمین نمی‌شود.' : item.status === 'prepared' ? 'حذف کامل نشده؛ فایل اصلی را بررسی و بازیابی کنید.' : item.status === 'restored' ? 'فایل بازیابی شده؛ برای تکمیل ثبت، بازیابی را بزنید.' : !item.recoverable ? 'نسخه فایل در دسترس نیست؛ بازیابی قابل تضمین نیست.' : `${Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 86400000)).toLocaleString('fa-IR')} روز تا حذف دائمی`}</small></div></div>
                <div className="ps-trash-actions"><button className="ps-button ps-button-secondary" disabled={p.mediaBusy || p.backupBusy} onClick={() => p.onRestoreTrash(item.token)}>بازیابی</button><button className="ps-button ps-button-secondary ps-trash-danger" disabled={p.mediaBusy || p.backupBusy || !['deleted', 'copying'].includes(item.status)} onClick={() => p.onPermanentTrash(item.token)}>حذف دائمی</button></div>
              </section>)}
              {p.media.deleted.length > 0 && <p className="ps-detail">موارد نسخه قبلی فقط از کتابخانه پنهان شده‌اند؛ فایل آن‌ها قبلاً حذف نشده است. بازیابی، وجود فایل اصلی را بررسی می‌کند. پاک‌سازی خودکار روی این موارد انجام نمی‌شود.</p>}
              {p.media.deleted.map(item => <Block key={item.id} icon={Trash2} title={item.title} description={item.fileName}><button className="ps-button ps-button-secondary" disabled={p.mediaBusy || p.backupBusy} onClick={() => p.onRestoreMedia('deleted', item.id)}>بررسی فایل و بازیابی مورد قدیمی</button></Block>)}
            </>}
            {p.page === 'پرونده‌های پنهان' && (() => {
              const kind = p.page === 'پرونده‌های پنهان' ? 'hidden' : 'deleted';
              const items = p.media[kind];
              return <><p className="ps-detail">{kind === 'hidden' ? 'آهنگ‌ها فقط در Ritmo پنهان می‌شوند؛ فایل روی دستگاه و عضویت در لیست‌های پخش حفظ می‌شود.' : 'آهنگ‌های حذف‌شده از کتابخانه Ritmo. فایل اصلی روی دستگاه باقی می‌ماند؛ حذف دائمی خارج از برنامه قابل بازیابی نیست.'}</p>{p.mediaError && <p role="alert" className="ps-message ps-error">{p.mediaError}</p>}{!items.length ? <EmptyState icon={kind === 'hidden' ? FolderLock : Trash2} title={kind === 'hidden' ? 'آهنگ پنهانی ندارید' : 'موردی برای بازیابی وجود ندارد'}>{kind === 'hidden' ? 'از منوی آهنگ، «پنهان‌کردن در ریتمو» را انتخاب کنید.' : 'آهنگ‌هایی که از کتابخانه Ritmo حذف کنید، اینجا نمایش داده می‌شوند.'}</EmptyState> : items.map(item => <Block key={item.id} icon={kind === 'hidden' ? FolderLock : Trash2} title={item.title} description={item.fileName}><p className="ps-detail">{item.folder}</p><button className="ps-button ps-button-secondary" disabled={p.mediaBusy || !!p.mediaError && !items.length} onClick={() => p.onRestoreMedia(kind, item.id)}>{p.mediaBusy ? 'در حال انجام...' : kind === 'hidden' ? 'نمایش دوباره' : 'بازیابی'}</button></Block>)}</>;
            })()}
            {p.page === 'پشتیبان‌گیری و بازیابی' && <>
              <div className="ps-data-note"><ShieldCheck size={22} /><div><strong>اطلاعات شما، نه فایل‌های رسانه‌ای</strong><p>مورد علاقه‌ها، لیست‌های پخش و تنظیمات ذخیره می‌شوند. موسیقی و ویدیو کپی نمی‌شوند.</p></div></div>
              <Block icon={Download} title="ایجاد پشتیبان" description="نام فایل را وارد کنید؛ سپس محل ذخیره را در حافظهٔ دستگاه انتخاب کنید."><label className="ps-backup-name">نام فایل پشتیبان<input value={p.backupFileName} maxLength={80} disabled={p.backupBusy} onChange={event => p.onBackupFileNameChange(event.target.value)} placeholder="مثلاً پشتیبان مهرماه" dir="auto" /></label><button disabled={p.backupBusy || !p.backupFileName.trim()} className="ps-button" onClick={p.onExport}><Download size={17} />انتخاب محل و ذخیره</button></Block>
              <Block icon={Upload} title="بازیابی" description="اطلاعات خود را از یک فایل پشتیبان بازیابی کنید."><button disabled={p.backupBusy} className="ps-button ps-button-secondary" onClick={p.onImport}><Upload size={17} />انتخاب فایل پشتیبان</button><p className="ps-footnote">فایل قبل از بازیابی بررسی می‌شود؛ جایگزینی اطلاعات فقط با تأیید شما انجام خواهد شد.</p></Block>
              <div className="ps-last-backup"><span>آخرین پشتیبان</span><strong>{stamp(p.lastBackup)}</strong></div>
              {p.backupBusy && <p role="status" className="ps-message">در حال انجام عملیات...</p>}
              {p.backupMessage && <p role="status" className="ps-message"><Check size={18} />{p.backupMessage}</p>}
              {p.backupError && <p role="alert" className="ps-message ps-error">{p.backupError}</p>}
            </>}
            {p.page === 'بازخورد' && <><div className="ps-communication"><span className="ps-empty-icon"><MessageCircle size={28} /></span><h2>نظر یا پیشنهادی دارید؟</h2><p>ارسال پیشنهاد و انتقاد به عادل آذری وند</p><p dir="ltr">azarivandadel@gmail.com</p></div><button className="ps-button" disabled={feedbackBusy} onClick={() => void sendFeedback()}>بازکردن برنامه ایمیل</button><p className="ps-footnote">اگر برنامه ایمیل باز نشد، آدرس بالا را در برنامه ایمیل خود وارد کنید.</p>{feedbackError && <p role="alert" className="ps-message ps-error">{feedbackError}</p>}</>}
            {p.page === 'درباره ما' && <><div className="ps-about"><span className="ps-about-mark"><Disc3 size={44} /></span><span className="ps-eyebrow">ریتم لحظه‌های شما</span><h2>Ritmo</h2><p>پخش‌کننده موسیقی و ویدیو</p><span className="ps-pill">نسخه {p.version}</span></div><div className="ps-facts"><div><span>سازنده</span><strong>عادل آذری وند</strong></div><div><span>نسخه</span><strong dir="ltr">{p.version}</strong></div></div><Block icon={MessageCircle} title="ارتباط با سازنده" description="برای ارتباط، پیشنهاد و انتقاد"><p className="ps-email" dir="ltr">azarivandadel@gmail.com</p><button className="ps-button ps-button-secondary" disabled={feedbackBusy} onClick={() => void sendFeedback()}>ارسال ایمیل<ChevronLeft size={16} /></button>{feedbackError && <p role="alert" className="ps-message ps-error">{feedbackError}</p>}</Block></>}
          </>}
        </div>
      </div>
    </div>
  </dialog>;
}
