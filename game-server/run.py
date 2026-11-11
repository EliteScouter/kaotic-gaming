"""Runs one game's own multiplayer server from the copy the Kaotic Gaming site downloaded,
and restarts it when the game is updated (the site switches to a new folder) or if it stops.

Settings (environment):
  GAME_SLUG     the game's slug in games.json, e.g. last-light
  GAME_COMMAND  how to start its server, run inside the game's folder (default: python server.py)
  GAMES_DIR     the site's downloaded games, mounted read-only (default: /games)
  PORT          passed on to the game's server (default: 8000)
"""
import json
import os
import shlex
import signal
import subprocess
import sys
import time

SLUG = os.environ['GAME_SLUG']
GAMES = os.environ.get('GAMES_DIR', '/games')
COMMAND = shlex.split(os.environ.get('GAME_COMMAND', 'python server.py'))

proc = None


def current_folder():
    """The folder the site is serving this game from right now, or None before the first download."""
    try:
        with open(os.path.join(GAMES, 'state.json'), encoding='utf-8') as f:
            name = json.load(f).get(SLUG, {}).get('dir')
    except (OSError, ValueError):
        return None
    folder = os.path.join(GAMES, name) if name else None
    return folder if folder and os.path.isdir(folder) else None


def stop():
    global proc
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
    proc = None


def quit_now(*_):
    stop()
    sys.exit(0)


signal.signal(signal.SIGTERM, quit_now)
signal.signal(signal.SIGINT, quit_now)

running_in = None
print(f'{SLUG}: waiting for the site to download the game', flush=True)
while True:
    folder = current_folder()
    crashed = proc is not None and proc.poll() is not None
    if folder != running_in or crashed:
        if crashed:
            print(f'{SLUG}: server stopped (exit code {proc.returncode}); starting it again', flush=True)
            time.sleep(3)
        stop()
        running_in = folder
        if folder:
            print(f'{SLUG}: starting "{" ".join(COMMAND)}" from {os.path.basename(folder)}', flush=True)
            proc = subprocess.Popen(COMMAND, cwd=folder, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    time.sleep(5)
