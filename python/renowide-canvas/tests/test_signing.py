"""Parity tests for the Canvas Kit v2 signing protocol.

These tests are the Python half of the *same* canonical strings
validated by ``packages/types/test/smoke.test.ts`` in the TypeScript
sibling. If this file passes but its TS counterpart doesn't (or
vice-versa), you have a protocol split and the backend will reject
one of the two implementations.
"""
from __future__ import annotations

import time

import pytest

from renowide_canvas.signing import (
    SignatureVerificationError,
    sign_action_request,
    sign_canvas_request,
    verify_action_request,
    verify_canvas_request,
)


SECRET = "super-secret-value"
AGENT_SLUG = "vibescan"


def _headers_for_canvas(signature: str, *, ts: int, request_id: str,
                        buyer: str = "", hire: str = "") -> dict:
    out = {
        "Renowide-Signature": f"v1={signature}",
        "X-Renowide-Timestamp": str(ts),
        "X-Renowide-Request-Id": request_id,
    }
    if buyer:
        out["X-Renowide-Buyer-Id"] = buyer
    if hire:
        out["X-Renowide-Hire-Id"] = hire
    return out


def test_sign_canvas_request_round_trip():
    ts = int(time.time())
    sig = sign_canvas_request(
        handoff_secret=SECRET,
        agent_slug=AGENT_SLUG,
        surface="hire_flow",
        buyer_id="buyer_01",
        hire_id=None,
        request_id="req_01",
        timestamp=ts,
    )
    assert len(sig) == 64 and all(c in "0123456789abcdef" for c in sig)

    verify_canvas_request(
        handoff_secret=SECRET,
        headers=_headers_for_canvas(sig, ts=ts, request_id="req_01", buyer="buyer_01"),
        agent_slug=AGENT_SLUG,
        surface="hire_flow",
    )


def test_canvas_missing_ids_use_dash_placeholder():
    ts = int(time.time())
    sig = sign_canvas_request(
        handoff_secret=SECRET,
        agent_slug=AGENT_SLUG,
        surface="post_hire",
        buyer_id=None,
        hire_id=None,
        request_id="req_x",
        timestamp=ts,
    )
    # empty header values should still verify — library treats "" as None
    verify_canvas_request(
        handoff_secret=SECRET,
        headers=_headers_for_canvas(sig, ts=ts, request_id="req_x"),
        agent_slug=AGENT_SLUG,
        surface="post_hire",
    )


def test_sign_action_request_round_trip():
    ts = int(time.time())
    body = b'{"action":"scan","block_id":"b1","payload":{"repo":"acme/app"}}'
    sig = sign_action_request(SECRET, body, ts)

    headers = {
        "Renowide-Signature": f"v1={sig}",
        "X-Renowide-Timestamp": str(ts),
    }
    verify_action_request(handoff_secret=SECRET, headers=headers, body=body)


def test_action_body_tampering_is_rejected():
    ts = int(time.time())
    body = b'{"action":"scan"}'
    sig = sign_action_request(SECRET, body, ts)

    tampered = b'{"action":"drop-tables"}'
    with pytest.raises(SignatureVerificationError) as exc:
        verify_action_request(
            handoff_secret=SECRET,
            headers={"Renowide-Signature": f"v1={sig}", "X-Renowide-Timestamp": str(ts)},
            body=tampered,
        )
    assert exc.value.code == "bad_signature"


def test_missing_signature_header_is_rejected():
    with pytest.raises(SignatureVerificationError) as exc:
        verify_action_request(
            handoff_secret=SECRET,
            headers={"X-Renowide-Timestamp": str(int(time.time()))},
            body=b"{}",
        )
    assert exc.value.code == "missing_header"


def test_stale_timestamp_is_rejected():
    ts = int(time.time()) - 10_000  # ~2.7 h ago
    sig = sign_action_request(SECRET, b"{}", ts)
    with pytest.raises(SignatureVerificationError) as exc:
        verify_action_request(
            handoff_secret=SECRET,
            headers={"Renowide-Signature": f"v1={sig}", "X-Renowide-Timestamp": str(ts)},
            body=b"{}",
        )
    assert exc.value.code == "stale_timestamp"


def test_unsupported_scheme_is_rejected():
    ts = int(time.time())
    sig = sign_action_request(SECRET, b"{}", ts)
    with pytest.raises(SignatureVerificationError) as exc:
        verify_action_request(
            handoff_secret=SECRET,
            headers={"Renowide-Signature": f"v2={sig}", "X-Renowide-Timestamp": str(ts)},
            body=b"{}",
        )
    assert exc.value.code == "unsupported_version"


def test_wrong_secret_is_rejected():
    ts = int(time.time())
    sig = sign_action_request("other-secret", b"{}", ts)
    with pytest.raises(SignatureVerificationError) as exc:
        verify_action_request(
            handoff_secret=SECRET,
            headers={"Renowide-Signature": f"v1={sig}", "X-Renowide-Timestamp": str(ts)},
            body=b"{}",
        )
    assert exc.value.code == "bad_signature"


def test_known_answer_canvas_canonical_string_matches_ts_sibling():
    """Fixed input → fixed signature. If this changes, the TS sibling
    must be updated in the same commit to keep the protocol in sync.
    """
    sig = sign_canvas_request(
        handoff_secret="test-secret",
        agent_slug="demo-agent",
        surface="hire_flow",
        buyer_id="buyer_01HX",
        hire_id=None,
        request_id="req_01HX",
        timestamp=1_700_000_000,
    )
    # Hex digest is reproducible; any mismatch means someone changed
    # the canonical string — coordinate with the TS side.
    assert sig == "daebca8b7aaa8a3e8f4d0b70278ac0eab1806ca5774b75d4040393641a94cf4a"
