import { Fragment } from 'react';
import { SYSTEMS } from '@couch/systems';
import type { HostSettings } from '../host-settings.js';
import { isDesktopClass, THEMES, THEME_NAMES } from '../host-settings.js';
import { Modal } from './common.js';

export function SettingsModal({ settings, onChange, onClose }: { settings: HostSettings; onChange: (s: Partial<HostSettings>) => void; onClose: () => void }) {
  const s = settings;
  const toggle = (k: keyof HostSettings, label: string, hint?: string) => (
    <button data-nav className="setting" onClick={() => onChange({ [k]: !s[k] } as Partial<HostSettings>)}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <b className={s[k] ? 'on' : 'off'}>{s[k] ? 'On' : 'Off'}</b>
    </button>
  );
  const cycle = <T,>(label: string, values: T[], current: T, set: (v: T) => void, show: (v: T) => string = String, hint?: string) => (
    <button data-nav className="setting" onClick={() => set(values[(values.indexOf(current) + 1) % values.length]!)}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <b>{show(current)}</b>
    </button>
  );
  return (
    <Modal onClose={onClose} className="settings">
      <h1>Settings</h1>
      <div className="settings-grid">
        {cycle('TV name', ['Living room', 'Bedroom', 'Game room', 'Couch'], s.hostName, (v) => onChange({ hostName: v }), String, 'Shown on phones')}
        {cycle('Players', [4, 8] as (4 | 8)[], s.maxPlayers, (v) => onChange({ maxPlayers: v }))}
        {cycle('Run-ahead', [0, 1, 2] as (0 | 1 | 2)[], s.runAhead, (v) => onChange({ runAhead: v }), (v) => (v ? `${v} frame${v > 1 ? 's' : ''}` : 'Off'), 'Removes game-logic lag on light systems; costs CPU')}
        {toggle('onlineArt', 'Box art from the internet', 'Looks up thumbnails.libretro.com by file name')}
        {cycle('Theme', THEMES, s.theme, (v) => onChange({ theme: v }), (v) => THEME_NAMES[v], s.theme === 'pixel' || s.theme === 'neon' ? 'Restyles itself for each console' : undefined)}
        {toggle('telemetry', 'Share anonymous latency stats', 'Per-session lag summaries, no names, saved on this computer (.cache/logs)')}
        <button data-nav className="setting" onClick={() => onChange({ onboardingDone: false })}>
          <span>Show the welcome tips again</span>
          <b>›</b>
        </button>
        {toggle('ambientMusic', 'Ambient music in the library')}
        {toggle('latencyOverlay', 'Latency overlay in game', 'Also: press L, or open it from the phone menu')}
        {toggle('showAllSystems', 'Show heavy systems on this device', isDesktopClass() ? 'This looks like a desktop: already shown' : 'PS1 / NDS / PSP may stutter here')}
        {toggle('experimentalPsp', 'PSP (experimental)', self.crossOriginIsolated ? 'Cross-origin isolated: OK' : 'Needs COI=1 and localhost')}
        {SYSTEMS.filter((sys) => (sys.web?.cores.length ?? 0) > 1).map((sys) => (
          <Fragment key={sys.id}>
            {cycle(`${sys.shortName} core`, sys.web!.cores, s.cores[sys.id] ?? sys.web!.cores[0]!, (v) => onChange({ cores: { ...s.cores, [sys.id]: v } }))}
          </Fragment>
        ))}
      </div>
      <p className="hint">
        Licences: docs/LICENSES.md · Cores are downloaded separately (pnpm cores) · Your ROMs never leave this computer.
      </p>
      <button className="primary" data-nav data-nav-default onClick={onClose}>
        Done
      </button>
    </Modal>
  );
}
