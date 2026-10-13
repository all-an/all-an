"""gunicorn settings, picked up automatically from the working directory, so the start command
can be exactly:  gunicorn all_an.wsgi:app

The port needs no setting: gunicorn binds 0.0.0.0:$PORT when PORT is set, which Railway does.
"""

import os

# Each worker is a separate process with its own database pool (see all_an/db.py), so the database
# sees workers x pool size connections. 2 x 5 stays well inside a small Postgres plan.
workers = int(os.environ.get("WEB_CONCURRENCY", 2))

# Threads for the waiting: most of a request is time spent in Postgres, and a thread blocked on a
# query frees the worker's others to carry on.
worker_class = "gthread"
threads = int(os.environ.get("GUNICORN_THREADS", 4))

# A quiz page is a handful of queries; anything slower than this is stuck, not slow.
timeout = 30

# Railway collects stdout, so access and error logs go there.
accesslog = "-"
errorlog = "-"
