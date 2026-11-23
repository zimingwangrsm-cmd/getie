"""Provision a product administrator locally; credentials never enter source or arguments."""
import argparse,getpass,os,secrets,sqlite3,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import accounts
p=argparse.ArgumentParser(description=__doc__);p.add_argument('username');a=p.parse_args()
username=accounts.name(a.username);password=accounts.password(getpass.getpass('Administrator password: '))
with sqlite3.connect(ROOT/'data/studio.sqlite3',timeout=20) as c:
 c.row_factory=sqlite3.Row;accounts.initialize(c);c.execute('BEGIN IMMEDIATE')
 row=c.execute('SELECT id,role FROM accounts WHERE username=?',(username,)).fetchone()
 if row:
  if row['role']!='admin':raise SystemExit('Existing member account is not changed; grant its role explicitly after ownership verification.')
  c.execute('UPDATE accounts SET password=? WHERE id=?',(accounts.hash_password(password),row['id']))
  c.execute('DELETE FROM auth_sessions WHERE account=?',(row['id'],))
 else:
  c.execute('INSERT INTO accounts(id,username,password,recovery,invite_code,created,role) VALUES(?,?,?,?,?,?,?)',('u_'+secrets.token_hex(16),username,accounts.hash_password(password),accounts.digest(secrets.token_hex(32)),secrets.token_hex(5).upper(),__import__('time').time(),'admin'))
os.chmod(ROOT/'data/studio.sqlite3',0o600)
print('Administrator provisioned. All configured models and creation features are available without credit or membership limits.')
