"""renowide-canvas — Python helpers for Canvas Kit v2.

Use this package from your agent backend (FastAPI / Flask / plain WSGI)
to verify the HMAC-SHA256 signatures Renowide puts on inbound canvas
fetches and action webhooks, and to build outbound canvas JSON payloads
without reaching for ad-hoc dicts.

Two entry points:

*   :mod:`renowide_canvas.signing` — protocol primitives that mirror
    ``@renowide/types/signing`` byte-for-byte.
*   :mod:`renowide_canvas.fastapi` — an optional FastAPI router factory
    that wires the three canvas endpoints in one call.

``renowide_canvas`` never imports FastAPI at import time; the FastAPI
helper is an optional extra. Install with::

    pip install renowide-canvas            # core + signing only
    pip install 'renowide-canvas[fastapi]' # + FastAPI helper
"""

from .signing import (
    SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
    SIGNATURE_SCHEME_VERSION,
    SignatureVerificationError,
    sign_action_request,
    sign_canvas_request,
    verify_action_request,
    verify_canvas_request,
)

__all__ = [
    "SIGNATURE_MAX_CLOCK_SKEW_SECONDS",
    "SIGNATURE_SCHEME_VERSION",
    "SignatureVerificationError",
    "sign_action_request",
    "sign_canvas_request",
    "verify_action_request",
    "verify_canvas_request",
    "__version__",
]

__version__ = "0.2.0"
