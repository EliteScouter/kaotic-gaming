# Runs a game's own multiplayer server (from the site's downloaded copy of the game). See run.py.
FROM python:3.13-alpine
COPY run.py /app/run.py
USER nobody
CMD ["python", "/app/run.py"]
