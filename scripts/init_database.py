"""Initialize an empty product database without starting an HTTP service."""
import os
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import DB, initialize_database
if __name__ == '__main__':
    initialize_database()
    os.chmod(DB, 0o600)
    print('Database initialized. No user or default password was created.')
