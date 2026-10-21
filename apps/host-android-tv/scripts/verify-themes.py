"""
Checks that the home screen themes never move components on the Android TV host.

For each theme it restarts the app with that theme (debug build, emulator or TV over adb), walks the
console strip with the D-pad, takes a screenshot and a UI dump per console, and compares the boxes
of the fixed components across consoles and with Midnight. Screenshots go to docs/design/themes/shots/tv-<theme>/.

Usage: python apps/host-android-tv/scripts/verify-themes.py [themes...]   (default: midnight pixel neon)
Needs: adb on the path or ADB=..., the debug app installed, a Couch server on the PC (COUCH_SERVER, default
http://10.0.2.2:8787 for the emulator), and the device's animations off:
  adb shell settings put global animator_duration_scale 0   (and transition_ / window_animation_scale)
"""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ADB = os.environ.get('ADB', 'adb')
PKG = 'com.tunisolutions.couch'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ENV = dict(os.environ, MSYS_NO_PATHCONV='1')
SERVER = os.environ.get('COUCH_SERVER', 'http://10.0.2.2:8787')


def adb(*args, out=None):
    r = subprocess.run([ADB, *args], env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if out:
        open(out, 'wb').write(r.stdout)
    return r.stdout


def set_theme(theme):
    xml = f"""<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <float name="measuredRatio" value="5.256935" />
    <int name="measuredTier" value="2" />
    <int name="tierOverride" value="5" />
    <boolean name="onboardingDone" value="true" />
    <boolean name="proDebug" value="true" />
    <string name="serverUrl">{SERVER}</string>
    <string name="theme">{theme}</string>
</map>
"""
    tmp = os.path.join(ROOT, 'apps', 'host-android-tv', 'build', 'couch-prefs.xml')
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    open(tmp, 'w', encoding='utf-8').write(xml)
    adb('shell', 'am', 'force-stop', PKG)
    adb('push', tmp, '/data/local/tmp/couch.xml')
    adb('shell', f"run-as {PKG} sh -c 'mkdir -p shared_prefs && cp /data/local/tmp/couch.xml shared_prefs/couch.xml'")
    adb('shell', 'monkey', '-p', PKG, '1')
    time.sleep(14)  # app start + server library


def key(code, n=1):
    for _ in range(n):
        adb('shell', 'input', 'keyevent', code)
        time.sleep(.25)


def dump():
    # Needs the device's animations off (endless animations keep uiautomator from reaching idle).
    for _ in range(5):
        adb('shell', 'rm', '-f', '/sdcard/ui.xml')
        adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
        raw = adb('shell', 'cat', '/sdcard/ui.xml').decode('utf-8', 'replace')
        if '<hierarchy' in raw:
            break
        time.sleep(1)
    root = ET.fromstring(raw[raw.index('<?xml'):])
    nodes = []
    for n in root.iter('node'):
        b = [int(v) for v in re.findall(r'-?\d+', n.get('bounds', ''))]
        nodes.append({'text': n.get('text', ''), 'desc': n.get('content-desc', ''), 'focusable': n.get('focusable') == 'true', 'focused': n.get('focused') == 'true', 'b': b})
    return nodes


def boxes(nodes):
    """Fixed components by role. Values: (left, top, width, height); widths of free text are left out."""
    texts = [n for n in nodes if n['text']]
    low = [t['text'].lower() for t in texts]
    out = {}

    def put(name, n, width=True):
        l, t, r, b = n['b']
        out[name] = (l, t, r - l, b - t) if width else (t, b - t)

    # Text nodes report the font's own glyph box (themed text may draw past its fixed box), so only
    # boxes are compared: the top bar's button, the focused console stop, a cover and the hint pills.
    focusable = [n for n in nodes if n['focusable']]
    if focusable:
        put('settings button', focusable[0])
    foc = [n for n in nodes if n['focused']]
    if foc:
        put('focused stop', foc[0])
    # The first cover in the wheel and the hint bar's buttons (right-aligned, fixed sizes).
    covers = [n for n in focusable if 140 < n['b'][3] - n['b'][1] < 260 and n['b'][1] > 700]
    if covers:
        put('a cover', min(covers, key=lambda n: n['b'][0]), width=True)
    pills = [n for n in focusable if n['b'][1] > 950]
    if pills:
        put('last pill', max(pills, key=lambda n: n['b'][2]))
    return out


def run(theme, shots=True):
    set_theme(theme)
    out_dir = os.path.join(ROOT, 'docs', 'design', 'themes', 'shots', f'tv-{theme}')
    os.makedirs(out_dir, exist_ok=True)
    key('KEYCODE_DPAD_UP')  # covers -> console strip
    time.sleep(1)
    seen = {}
    for step in range(16):
        nodes = dump()
        stop = next((i for i, n in enumerate(nodes) if n['focused']), None)
        name = f'stop{step}'
        if stop is not None:
            l, t, r, b = nodes[stop]['b']
            # The stop's logo description or label, from the nodes inside it.
            inner = [n for n in nodes[stop:] if (n['desc'] or n['text']) and n['b'][0] >= l and n['b'][2] <= r and n['b'][1] >= t and n['b'][3] <= b]
            if inner:
                name = inner[0]['desc'] or inner[0]['text']
        # Past the end of the console strip, the D-pad moves on to the hint bar: stop.
        if name in seen or (stop is not None and not 540 < nodes[stop]['b'][1] < 720):
            break
        seen[name] = boxes(nodes)
        if shots:
            adb('exec-out', 'screencap', '-p', out=os.path.join(out_dir, re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') + '.png'))
        key('KEYCODE_DPAD_RIGHT')
        time.sleep(1.4)
    return seen


def compare(label, a, b):
    diffs = 0
    for comp in sorted(set(a) | set(b)):
        if a.get(comp) != b.get(comp):
            diffs += 1
            print(f'  {label} {comp}: {a.get(comp)} vs {b.get(comp)}')
    return diffs


def main():
    themes = sys.argv[1:] or ['midnight', 'pixel', 'neon']
    results = {t: run(t) for t in themes}
    for t, stops in results.items():
        names = list(stops)
        ref = stops[names[0]]
        d = sum(compare(f'[{t}] {n}', stops[n], ref) for n in names[1:])
        print(f'{t}: {len(names)} stops ({", ".join(names)}): {d} differences between consoles')
    if 'midnight' in results:
        m = results['midnight']
        for t in themes:
            if t == 'midnight':
                continue
            d = sum(compare(f'{t} vs midnight · {n}', results[t][n], m[n]) for n in results[t] if n in m)
            print(f'{t} vs midnight: {d} differences')


if __name__ == '__main__':
    main()
