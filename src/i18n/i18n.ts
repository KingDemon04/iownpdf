import { translations, Lang, TranslationKey } from './translations';

const STORAGE_KEY = 'pdf_studio_lang';

class I18nManager {
  private currentLang: Lang;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    const browserLang = navigator.language.startsWith('it') ? 'it' : 'en';
    this.currentLang = saved || browserLang;
  }

  public getLang(): Lang {
    return this.currentLang;
  }

  public setLang(lang: Lang): void {
    this.currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    this.updateDOM();
  }

  public toggleLang(): Lang {
    const next: Lang = this.currentLang === 'it' ? 'en' : 'it';
    this.setLang(next);
    return next;
  }

  public t(key: TranslationKey): string {
    return translations[this.currentLang][key];
  }

  // Aggiorna tutti gli elementi HTML che possiedono l'attributo [data-i18n]
  public updateDOM(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n') as TranslationKey;
      if (key && translations[this.currentLang][key]) {
        el.textContent = translations[this.currentLang][key];
      }
    });
  }
}

export const i18n = new I18nManager();