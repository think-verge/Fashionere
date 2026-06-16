"""Force mock providers during tests, regardless of the local .env.

Set before any app module imports config (which calls load_dotenv, and
load_dotenv does not override existing env vars). Keeps the suite hermetic and
free of real API calls / cost.
"""
import os

os.environ.setdefault("IMAGE_PROVIDER", "mock")
os.environ.setdefault("TEXT_PROVIDER", "mock")
os.environ.setdefault("TREND_PROVIDER", "mock")
# Tests assert every section is populated, so force the full tile profile
# (the local .env uses a lean profile for cheap real-provider demos).
os.environ.setdefault("IMAGE_TILES", "hero:3,silhouette:2,texture:2,pattern:2,detail:2,styling:1,colorway:2")
