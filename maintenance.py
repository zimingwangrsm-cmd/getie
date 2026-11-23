"""SQLite online backups and bounded operational housekeeping."""
from datetime import datetime,timezone
from pathlib import Path
import os
import sqlite3
import time

def backup(database,destination=None):
    root=Path(database).parent/'backups';root.mkdir(mode=0o700,exist_ok=True)
    target=Path(destination) if destination else root/('studio-'+datetime.now(timezone.utc).strftime('%Y-%m-%d')+'.sqlite3')
    if target.exists() and not destination:return str(target)
    target.parent.mkdir(parents=True,exist_ok=True);partial=target.with_suffix('.partial')
    with sqlite3.connect(database,timeout=20) as source,sqlite3.connect(partial) as dest:
        source.backup(dest,pages=256)
        if dest.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity check failed')
    os.chmod(partial,0o600);partial.replace(target)
    if not destination:
        for old in sorted(root.glob('studio-*.sqlite3'))[:-7]:old.unlink()
    return str(target)

def housekeeping(database):
    with sqlite3.connect(database,timeout=20) as c:
        c.execute('DELETE FROM auth_sessions WHERE expires<?',(time.time(),))
        c.execute('DELETE FROM auth_attempts WHERE created<?',(time.time()-3600,))
    return backup(database)

def loop(database):
    while True:
        try:housekeeping(database)
        except (OSError,sqlite3.Error,RuntimeError):print('Scheduled database maintenance deferred; retry next hour.',flush=True)
        time.sleep(3600)
