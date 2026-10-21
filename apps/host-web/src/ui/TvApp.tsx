/**
 * "Android TV app" button + panel: tells people there is a native app version (CoucheTV)
 * and offers the APK the couch server has (/api/apk), with a QR code for phones.
 */
import { useEffect, useState } from 'react';
import { Icon, Modal, QR } from './common.js';

export interface ApkInfo {
  file: string;
  version: string | null;
  size: number | null;
  url: string;
}

/** The APK this server offers, or null (none uploaded / old server). */
export function useApk(): ApkInfo | null {
  const [apk, setApk] = useState<ApkInfo | null>(null);
  useEffect(() => {
    fetch('/api/apk')
      .then((r) => (r.ok ? (r.json() as Promise<ApkInfo>) : null))
      .then(setApk)
      .catch(() => setApk(null));
  }, []);
  return apk;
}

export function TvAppButton({ apk, onOpen }: { apk: ApkInfo; onOpen: () => void }) {
  return (
    <button className="add tvapp-chip" data-nav onClick={onOpen} title={apk.file}>
      <Icon name="tv" /> Android TV app
    </button>
  );
}

export function TvAppPanel({ apk, onClose }: { apk: ApkInfo; onClose: () => void }) {
  const href = new URL(apk.url, location.origin).toString();
  const size = apk.size ? ` · ${(apk.size / 1024 / 1024).toFixed(0)} MB` : '';
  return (
    <Modal onClose={onClose} className="tvapp">
      <h1>Play on your Android TV</h1>
      <p className="tvapp-lead">
        There is also an app version of Couch, <b>CoucheTV</b>, for Android TV and Google TV boxes. It runs the games on the box itself, without a browser:
      </p>
      <ul className="tvapp-points">
        <li>
          <b>Heavier systems</b>: N64 and PS2, and smoother PS1, PSP and DS
        </li>
        <li>
          <b>Play locally</b>: games from a USB drive or the box's storage, no server needed
        </li>
        <li>
          <b>Same controllers</b>: phones still scan a QR code, and Bluetooth gamepads work too
        </li>
        <li>
          <b>This library too</b>: in the app, Settings → Couch server → <code>{location.origin}</code>
        </li>
      </ul>
      <div className="tvapp-download">
        <QR text={href} size={150} />
        <div>
          <a className="add tvapp-get" data-nav data-nav-default href={apk.url} download={apk.file} target={apk.size === null ? '_blank' : undefined} rel="noreferrer">
            ⬇ Download CoucheTV{apk.version ? ` ${apk.version}` : ''}
            {size}
          </a>
          <p className="tvapp-how">
            <b>On the TV box:</b> install the free <i>Downloader</i> app and open <code>{href}</code>, or scan the code with a phone and copy the file over
            (USB drive, <code>adb install</code>). Allow "Install unknown apps" when Android asks.
          </p>
        </div>
      </div>
      <div className="storage-actions">
        <button className="add" data-nav onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
