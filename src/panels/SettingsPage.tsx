import { useEffect, useState } from 'react';
import { evesov } from '@/api/evesov';
import {
  THEMES,
  COLOR_TOKENS,
  type ThemeName,
  applyTheme,
  setTheme,
  getTheme,
  setColorOverride,
  clearColorOverride,
  getColorOverride
} from '@/state/theme';

type TabId = 'general' | 'preferences' | 'data';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'data', label: 'Data' }
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('general');

  return (
    <div className="settings">
      <nav className="settings__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`settings__tab${tab === t.id ? ' settings__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings__panel" role="tabpanel">
        {tab === 'general' && <GeneralSection />}
        {tab === 'preferences' && <PreferencesPlaceholder />}
        {tab === 'data' && <DataPlaceholder />}
      </div>
    </div>
  );
}

const MARKET_SYNC_KEY = 'settings.marketSync.enabled';

function GeneralSection() {
  const [theme, setThemeState] = useState<ThemeName>('abyss');
  const [colors, setColors] = useState<Record<string, string>>({});
  const [marketSync, setMarketSync] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await getTheme();
      if (cancelled) return;
      setThemeState(t);
      const next: Record<string, string> = {};
      for (const tok of COLOR_TOKENS) {
        const v = await getColorOverride(tok.id);
        if (v) next[tok.id] = v;
      }
      if (!cancelled) setColors(next);
      const ms = await evesov.prefs.get(MARKET_SYNC_KEY);
      if (!cancelled) setMarketSync(ms === '1');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPickTheme = async (id: ThemeName) => {
    setThemeState(id);
    await setTheme(id);
  };

  const onColorChange = async (token: string, value: string) => {
    setColors((c) => ({ ...c, [token]: value }));
    await setColorOverride(token, value);
  };

  const onColorReset = async (token: string) => {
    setColors((c) => {
      const next = { ...c };
      delete next[token];
      return next;
    });
    await clearColorOverride(token);
  };

  const onToggleMarketSync = async () => {
    const next = !marketSync;
    setMarketSync(next);
    await evesov.prefs.set(MARKET_SYNC_KEY, next ? '1' : '0');
  };

  const onResetDefaults = async () => {
    if (!confirm('Reset all program defaults? Theme, colors, and sync preferences will be cleared. The app will reload.')) {
      return;
    }
    await evesov.prefs.deletePrefix('settings.');
    applyTheme('abyss');
    for (const tok of COLOR_TOKENS) {
      document.documentElement.style.removeProperty(tok.cssVar);
    }
    window.location.reload();
  };

  return (
    <>
      <section className="settings__group">
        <h3 className="settings__group-title">Theme</h3>
        <div className="settings__row">
          <span className="settings__row-label">Color palette</span>
          <div className="settings__row-control">
            <div className="settings__theme-options">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`settings__theme-option${theme === t.id ? ' settings__theme-option--active' : ''}`}
                  onClick={() => void onPickTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {COLOR_TOKENS.map((tok) => (
          <div key={tok.id} className="settings__row">
            <span className="settings__row-label">{tok.label} color</span>
            <div className="settings__row-control">
              <input
                type="color"
                className="settings__color-input"
                value={colors[tok.id] ?? readComputedColor(tok.cssVar)}
                onChange={(e) => void onColorChange(tok.id, e.target.value)}
              />
              {colors[tok.id] && (
                <button
                  type="button"
                  className="settings__color-reset"
                  onClick={() => void onColorReset(tok.id)}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="settings__group">
        <h3 className="settings__group-title">Sync</h3>
        <div className="settings__row">
          <span className="settings__row-label">Market data sync</span>
          <div className="settings__row-control">
            <button
              type="button"
              className={`settings__toggle${marketSync ? ' settings__toggle--on' : ''}`}
              onClick={() => void onToggleMarketSync()}
            >
              {marketSync ? 'Enabled' : 'Disabled'}
            </button>
            <span className="settings__hint">
              Master switch over per-source toggles in the Data tab. No outbound traffic until Data Sync ships.
            </span>
          </div>
        </div>
      </section>

      <section className="settings__group">
        <h3 className="settings__group-title">Reset</h3>
        <div className="settings__row">
          <span className="settings__row-label">Program defaults</span>
          <div className="settings__row-control">
            <button type="button" className="settings__danger" onClick={() => void onResetDefaults()}>
              Reset to defaults
            </button>
            <span className="settings__hint">
              Clears all <code>settings.*</code> preferences and reloads. Plans, dock layout, and data are untouched.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

function readComputedColor(cssVar: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return normalizeToHex(raw);
}

function normalizeToHex(value: string): string {
  if (!value) return '#000000';
  if (value.startsWith('#')) {
    if (value.length === 4) {
      return (
        '#' +
        value
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      );
    }
    return value.length >= 7 ? value.slice(0, 7) : value;
  }
  return '#000000';
}

function PreferencesPlaceholder() {
  return <div className="settings__hint">Default open panels — coming next.</div>;
}

function DataPlaceholder() {
  return <div className="settings__hint">Sync controls, upgrade editor, CSV re-import, and purge — coming next.</div>;
}
