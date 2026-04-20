"""Errors that handlers raise and the runtime surfaces with the right
billing/audit semantics."""


class AgentSDKError(Exception):
    kind: str = "internal_error"

    def __init__(self, message: str, kind: str | None = None) -> None:
        super().__init__(message)
        if kind is not None:
            self.kind = kind


class BudgetExceededError(AgentSDKError):
    kind = "budget_exceeded"

    def __init__(self, required_credits: int, remaining_credits: int) -> None:
        super().__init__(
            f"Tool requires {required_credits} credits but only "
            f"{remaining_credits} remain on this hire."
        )
        self.required_credits = required_credits
        self.remaining_credits = remaining_credits


class ValidationError(AgentSDKError):
    kind = "validation"

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field
