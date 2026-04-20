"""
Hosted Layout v0.6 — block DSL for **Persona B hosted agents**.

Previously informally called "Persona B hosted canvas"; renamed to
Hosted Layout to eliminate the naming collision with Canvas Kit v2.
The protocol and schema are unchanged — only the name.

These TypedDicts describe the static blocks Renowide renders inside its
own buyer UI when you publish a Persona B agent (``renowide publish``
with a ``renowide.yaml`` that embeds a ``hire_page_canvas:`` /
``post_hire_canvas:`` tree directly in the manifest). They are the
Python twin of :mod:`@renowide/agent-sdk/canvas-kit` in TypeScript.

v0.6 additions: ``BlockFileUpload``, ``BlockDatePicker``, ``BlockMarkdown``,
``BlockCodeBlock``, ``BlockChart``, ``Brand``, ``ToolManifest``,
``CanvasVariant``.

.. warning::
   This is **not** the same protocol as Canvas Kit v2 (Path C — SDUI +
   ``custom_embed``). Canvas Kit v2 is a dynamic JSON response your
   backend returns per-hire, with a richer block set, expression grammar,
   and HMAC signing. For that, install the companion package::

       pip install renowide-canvas

   and import signing helpers / FastAPI router from
   :mod:`renowide_canvas`. This file stays for Persona B compatibility.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict, Union


class _BlockBase(TypedDict, total=False):
    when: str


class BlockHeader(_BlockBase):
    type: Literal["header"]
    text: str


class BlockSection(_BlockBase):
    type: Literal["section"]
    text: str


class BlockDivider(_BlockBase):
    type: Literal["divider"]


class BlockInfoCallout(_BlockBase, total=False):
    type: Literal["info_callout"]
    variant: Literal["info", "warn", "success"]
    text: str


class BlockImage(_BlockBase, total=False):
    type: Literal["image"]
    url: str
    alt: str
    caption: str


class BlockIntegrationButton(_BlockBase, total=False):
    type: Literal["integration_button"]
    provider: str
    scopes: List[str]
    required: bool
    label: str


class BlockApiKeyInput(_BlockBase, total=False):
    type: Literal["api_key_input"]
    id: str
    label: str
    placeholder: str
    help_url: str
    required: bool


class BlockOAuthButton(_BlockBase, total=False):
    type: Literal["oauth_button"]
    provider: str
    label: str
    scopes: List[str]


class BlockCheckbox(_BlockBase, total=False):
    type: Literal["checkbox"]
    id: str
    text: str
    required: bool
    default: bool


class BlockTextInput(_BlockBase, total=False):
    type: Literal["text_input"]
    id: str
    label: str
    placeholder: str
    required: bool
    pattern: str


class BlockCTA(_BlockBase, total=False):
    type: Literal["cta"]
    text: str
    action: str
    style: Literal["primary", "secondary"]


class BlockLinkButton(_BlockBase, total=False):
    type: Literal["link_button"]
    text: str
    url: str


class BlockQuickReply(_BlockBase, total=False):
    type: Literal["quick_reply"]
    prompts: List[str]


class BlockKPI(_BlockBase, total=False):
    type: Literal["kpi"]
    label: str
    value: str
    trend: str


class BlockTable(_BlockBase, total=False):
    type: Literal["table"]
    columns: List[str]
    rows: List[List[Union[str, int, float, bool, None]]]


# ─── v0.6 blocks ─────────────────────────────────────────────────────────────


class BlockFileUpload(_BlockBase, total=False):
    type: Literal["file_upload"]
    id: str
    label: str
    required: bool
    accept: List[str]
    max_mb: int
    help: str


class BlockDatePicker(_BlockBase, total=False):
    type: Literal["date_picker"]
    id: str
    label: str
    mode: Literal["date", "datetime"]
    required: bool
    min: str
    max: str
    default: str


class BlockMarkdown(_BlockBase, total=False):
    type: Literal["markdown"]
    source: str


class BlockCodeBlock(_BlockBase, total=False):
    type: Literal["code_block"]
    language: str
    source: str
    filename: str


class ChartSeries(TypedDict, total=False):
    label: str
    data: List[float]


class BlockChart(_BlockBase, total=False):
    type: Literal["chart"]
    chart_type: Literal["bar", "line", "pie", "area"]
    title: str
    labels: List[str]
    series: List[ChartSeries]
    stacked: bool


CanvasBlock = Union[
    BlockHeader, BlockSection, BlockDivider, BlockInfoCallout, BlockImage,
    BlockIntegrationButton, BlockApiKeyInput, BlockOAuthButton, BlockCheckbox,
    BlockTextInput, BlockCTA, BlockLinkButton, BlockQuickReply, BlockKPI, BlockTable,
    BlockFileUpload, BlockDatePicker, BlockMarkdown, BlockCodeBlock, BlockChart,
]


# ─── v0.6 Brand + Tool schema ────────────────────────────────────────────────


class Brand(TypedDict, total=False):
    primary_color: str
    accent_color: str
    text_color: str
    surface_color: str
    font_family: Literal[
        "inter",
        "ibm_plex_sans",
        "roboto",
        "space_grotesk",
        "source_serif_pro",
        "jetbrains_mono",
        "system",
    ]
    border_radius: Literal["none", "small", "medium", "large"]


class ToolInputField(TypedDict, total=False):
    name: str
    type: Literal["string", "number", "integer", "boolean", "date", "file", "enum"]
    description: str
    required: bool
    enum: List[str]
    default: Union[str, int, float, bool]


class ToolManifest(TypedDict, total=False):
    name: str
    display_name: str
    description: str
    category: Literal["read", "write", "communicate", "analyse", "act"]
    inputs: List[ToolInputField]
    requires_approval: bool
    icon: str


class CanvasVariant(TypedDict, total=False):
    id: str
    weight: int
    blocks: List[CanvasBlock]


class TileSource(TypedDict, total=False):
    type: Literal["tool_call", "static"]
    tool: str
    data: Dict[str, Any]


class DashboardTile(TypedDict, total=False):
    id: str
    title: str
    size: Literal["small", "medium", "large"]
    source: TileSource
    render: List[CanvasBlock]


class ChatConfig(TypedDict, total=False):
    primary_color: str
    avatar: str
    greeting: str
    starter_prompts: List[str]
    canvas: List[CanvasBlock]
    variants: List[CanvasVariant]


class PostHireConfig(TypedDict, total=False):
    welcome_message: str
    welcome_canvas: List[CanvasBlock]
    variants: List[CanvasVariant]


# ─── Convenience constructors ────────────────────────────────────────────────


def header(text: str, when: Optional[str] = None) -> BlockHeader:
    out: BlockHeader = {"type": "header", "text": text}  # type: ignore[typeddict-item]
    if when:
        out["when"] = when
    return out


def section(text: str, when: Optional[str] = None) -> BlockSection:
    out: BlockSection = {"type": "section", "text": text}  # type: ignore[typeddict-item]
    if when:
        out["when"] = when
    return out


def cta(
    text: str,
    action: str,
    *,
    style: Literal["primary", "secondary"] = "primary",
    when: Optional[str] = None,
) -> BlockCTA:
    out: BlockCTA = {"type": "cta", "text": text, "action": action, "style": style}  # type: ignore[typeddict-item]
    if when:
        out["when"] = when
    return out


def integration_button(
    provider: str,
    *,
    required: bool = False,
    scopes: Optional[List[str]] = None,
    label: Optional[str] = None,
    when: Optional[str] = None,
) -> BlockIntegrationButton:
    out: BlockIntegrationButton = {  # type: ignore[typeddict-item]
        "type": "integration_button",
        "provider": provider,
        "required": required,
    }
    if scopes is not None:
        out["scopes"] = scopes
    if label is not None:
        out["label"] = label
    if when:
        out["when"] = when
    return out
