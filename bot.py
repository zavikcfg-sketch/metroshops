"""Совместимость Bothost: перенаправление на Node.js."""
import os
import subprocess
import sys

root = os.path.dirname(os.path.abspath(__file__))
sys.exit(subprocess.call(["node", "app.js"], cwd=root))
