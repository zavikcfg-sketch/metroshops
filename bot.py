"""Совместимость Bothost: sh start.sh (бот + http-wrapper)."""
import os
import subprocess
import sys

root = os.path.dirname(os.path.abspath(__file__))
sys.exit(subprocess.call(["sh", "start.sh"], cwd=root))
