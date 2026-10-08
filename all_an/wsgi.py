"""The entry point gunicorn loads:  gunicorn all_an.wsgi:app"""

from . import create_app

app = create_app()
