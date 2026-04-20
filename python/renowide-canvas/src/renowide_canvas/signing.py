"""HMAC-SHA256 signing + verification for Canvas Kit v2.

Mirror of ``@renowide/types/signing`` in the JavaScript monorepo. The
canonical strings and wire headers must stay bit-identical across the
two implementations; if you change one, change the other.

Canonical strings
-----------------

* Canvas GET (``/canvas/<surface>.json``)::

      v1:<ts>:<agent_slug>:<surface>:<buyer_id|->:<hire_id|->:<request_id>

* Action POST (``/actions``)::

      v1:<ts>:<raw_body_bytes>

  where *raw_body_bytes* is the exact on-the-wire bytes of the JSON
  payload — not a re-serialisation.

Wire header::

    Renowide-Signature: v1=<64-char lowercase hex>

Additional headers on every inbound request:

* ``X-Renowide-Timestamp``   — Unix seconds integer.
* ``X-Renowide-Request-Id``  — ULID.
* ``X-Renowide-Buyer-Id``    — optional.
* ``X-Renowide-Hire-Id``     — optional.

We reject stale requests (``|now - ts| > 300 s``).
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Mapping, Optional, Union

SIGNATURE_SCHEME_VERSION: str = "v1"
SIGNATURE_MAX_CLOCK_SKEW_SECONDS: int = 300

__all__ = [
    "SIGNATURE_SCHEME_VERSION",
    "SIGNATURE_MAX_CLOCK_SKEW_SECONDS",
    "SignatureVerificationError",
    "sign_canvas_request",
    "sign_action_request",
    "verify_canvas_request",
    "verify_action_request",
]


class SignatureVerificationError(Exception):
    """Raised when a signed Renowide request fails verification.

    The ``code`` attribute is a short machine-readable string (see the
    SDK docs) so you can map it into a structured HTTP response.
    """

    def __init__(self, code: str, message: Optional[str] = None) -> None:
        super().__init__(message or code)
        self.code = code


# ─── Signing ────────────────────────────────────────────────────────────────


def sign_canvas_request(
    *,
    handoff_secret: Union[str, bytes],
    agent_slug: str,
    surface: str,
    buyer_id: Optional[str],
    hire_id: Optional[str],
    request_id: str,
    timestamp: int,
) -> str:
    """Return the lowercase-hex HMAC for a canvas GET request.

    Wire as ``Renowide-Signature: v1=<result>`` on the outbound
    request (or verify against it on the inbound side via
    :func:`verify_canvas_request`).
    """
    canonical = (
        f"{SIGNATURE_SCHEME_VERSION}:{timestamp}:{agent_slug}:{surface}:"
        f"{buyer_id or '-'}:{hire_id or '-'}:{request_id}"
    )
    key = handoff_secret.encode("utf-8") if isinstance(handoff_secret, str) else handoff_secret
    return hmac.new(key, canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_action_request(
    handoff_secret: Union[str, bytes],
    body: bytes,
    timestamp: int,
) -> str:
    """Return the lowercase-hex HMAC for an action POST request.

    ``body`` must be the **exact bytes** that will hit the wire; never
    re-serialised JSON (key ordering is not guaranteed stable).
    """
    if not isinstance(body, (bytes, bytearray, memoryview)):  # pragma: no cover - defensive
        raise TypeError("body must be bytes; never a parsed JSON object")

    key = handoff_secret.encode("utf-8") if isinstance(handoff_secret, str) else handoff_secret
    mac = hmac.new(key, None, hashlib.sha256)
    mac.update(f"{SIGNATURE_SCHEME_VERSION}:{timestamp}:".encode("utf-8"))
    mac.update(bytes(body))
    return mac.hexdigest()


# ─── Verification ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _ParsedSigHeader:
    version: str
    hex_digest: str


def verify_canvas_request(
    *,
    handoff_secret: Union[str, bytes],
    headers: Mapping[str, str],
    agent_slug: str,
    surface: str,
    now_seconds: Optional[int] = None,
    max_clock_skew_seconds: int = SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
) -> None:
    """Verify an inbound canvas-fetch GET.

    Raises :class:`SignatureVerificationError` on failure.

    ``headers`` should be the request's canonical header mapping
    (Starlette's ``request.headers`` works; Flask's ``request.headers``
    works; a plain dict works). Header name matching is case-insensitive.
    """
    sig = _parse_signature_header(_get_header(headers, "renowide-signature"))
    ts = _parse_int_header(_get_header(headers, "x-renowide-timestamp"), "x-renowide-timestamp")
    request_id = _get_header(headers, "x-renowide-request-id")
    if not request_id:
        raise SignatureVerificationError("missing_header", "x-renowide-request-id is required")

    buyer_id = _get_header(headers, "x-renowide-buyer-id") or None
    hire_id = _get_header(headers, "x-renowide-hire-id") or None

    _check_clock_skew(ts, now_seconds, max_clock_skew_seconds)

    expected = sign_canvas_request(
        handoff_secret=handoff_secret,
        agent_slug=agent_slug,
        surface=surface,
        buyer_id=buyer_id,
        hire_id=hire_id,
        request_id=request_id,
        timestamp=ts,
    )
    if not hmac.compare_digest(sig.hex_digest, expected):
        raise SignatureVerificationError("bad_signature", "HMAC mismatch")


def verify_action_request(
    *,
    handoff_secret: Union[str, bytes],
    headers: Mapping[str, str],
    body: bytes,
    now_seconds: Optional[int] = None,
    max_clock_skew_seconds: int = SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
) -> None:
    """Verify an inbound action POST.

    ``body`` must be the raw request bytes (e.g. ``await request.body()``
    in FastAPI, ``request.get_data()`` in Flask). Do **not** pass
    ``request.json`` — re-serialisation will break the signature.
    """
    sig = _parse_signature_header(_get_header(headers, "renowide-signature"))
    ts = _parse_int_header(_get_header(headers, "x-renowide-timestamp"), "x-renowide-timestamp")
    _check_clock_skew(ts, now_seconds, max_clock_skew_seconds)

    expected = sign_action_request(handoff_secret, body, ts)
    if not hmac.compare_digest(sig.hex_digest, expected):
        raise SignatureVerificationError("bad_signature", "HMAC mismatch")


# ─── Internals ──────────────────────────────────────────────────────────────


def _get_header(headers: Mapping[str, str], name: str) -> Optional[str]:
    lower = name.lower()
    for k, v in headers.items():
        if k.lower() == lower:
            return v
    return None


def _parse_signature_header(raw: Optional[str]) -> _ParsedSigHeader:
    if not raw:
        raise SignatureVerificationError("missing_header", "Renowide-Signature header is required")
    parts = raw.split("=", 1)
    if len(parts) != 2:
        raise SignatureVerificationError("malformed_header", f"could not parse {raw!r}")
    version, hex_digest = parts[0].strip(), parts[1].strip().lower()
    if version != SIGNATURE_SCHEME_VERSION:
        raise SignatureVerificationError(
            "unsupported_version",
            f"unsupported signature scheme version {version!r}",
        )
    if len(hex_digest) != 64 or any(c not in "0123456789abcdef" for c in hex_digest):
        raise SignatureVerificationError(
            "malformed_header",
            "signature must be a 64-char lowercase hex digest",
        )
    return _ParsedSigHeader(version=version, hex_digest=hex_digest)


def _parse_int_header(raw: Optional[str], name: str) -> int:
    if not raw:
        raise SignatureVerificationError("missing_header", f"{name} is required")
    try:
        return int(raw)
    except ValueError:
        raise SignatureVerificationError("malformed_header", f"{name} must be an integer")


def _check_clock_skew(ts: int, now_seconds: Optional[int], max_skew: int) -> None:
    now = time.time() if now_seconds is None else now_seconds
    if abs(int(now) - ts) > max_skew:
        raise SignatureVerificationError(
            "stale_timestamp",
            f"timestamp skew {abs(int(now) - ts)}s exceeds max {max_skew}s",
        )
