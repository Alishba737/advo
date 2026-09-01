"""ADVO Agent — LangGraph-based agentic orchestration with Qwen2.5."""

from __future__ import annotations

from typing import Annotated, TypedDict, Literal

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    BaseMessage,
)
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from packages.agent.llm import get_primary_llm, get_fast_llm
from packages.agent.prompts import get_system_prompt
from packages.agent.tools import (
    ADVO_TOOLS,
    set_retriever,
    set_knowledge_graph,
    start_retrieval_run,
    get_retrieved_chunks,
)


class AgentState(TypedDict):
    """State flowing through the LangGraph agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    user_mode: str  # citizen, student, lawyer
    session_id: str


class AdvoAgent:
    """ADVO's agentic system built on LangGraph.

    Flow:
        User Query → Router (intent detection) → Tool calls → LLM Reasoning → Response
    """

    def __init__(self, retriever=None, knowledge_graph=None):
        if retriever:
            set_retriever(retriever)
        if knowledge_graph:
            set_knowledge_graph(knowledge_graph)

        self.primary_llm = get_primary_llm(temperature=0.2)
        self.fast_llm = get_fast_llm(temperature=0.1)

        # Bind tools to the primary LLM
        self.llm_with_tools = self.primary_llm.bind_tools(ADVO_TOOLS)

        # Build the LangGraph
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Construct the LangGraph state machine."""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", ToolNode(ADVO_TOOLS))

        # Add edges
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {"tools": "tools", "end": END},
        )
        workflow.add_edge("tools", "agent")

        return workflow.compile()

    def _agent_node(self, state: AgentState) -> dict:
        """The main agent node — decides what to do based on context."""
        messages = state["messages"]
        user_mode = state.get("user_mode", "citizen")

        # Prepend system prompt
        system_prompt = get_system_prompt(user_mode)
        full_messages = [SystemMessage(content=system_prompt)] + messages

        # Call LLM with tools
        response = self.llm_with_tools.invoke(full_messages)
        return {"messages": [response]}

    def _should_continue(self, state: AgentState) -> Literal["tools", "end"]:
        """Decide whether to call tools or end the conversation."""
        last_message = state["messages"][-1]

        # If the LLM made tool calls, route to tools
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "tools"

        # Otherwise, end
        return "end"

    def chat(
        self,
        user_message: str,
        session_id: str = "default",
        user_mode: str = "citizen",
        history: list[BaseMessage] | None = None,
    ) -> dict:
        """Send a message and get a complete response.

        Returns dict with:
            - response: str — the agent's response text
            - citations: list — extracted citations
            - tool_calls_made: int — number of tools used
        """
        messages = list(history or [])
        messages.append(HumanMessage(content=user_message))

        # Track retrievals made during this run so citations can be verified
        start_retrieval_run()

        input_state = {
            "messages": messages,
            "user_mode": user_mode,
            "session_id": session_id,
        }

        result = self.graph.invoke(input_state)

        # Extract final response
        final_messages = result["messages"]
        response_text = ""
        tool_calls_count = 0

        for msg in final_messages:
            if isinstance(msg, AIMessage):
                if msg.tool_calls:
                    tool_calls_count += len(msg.tool_calls)
                elif msg.content:
                    response_text = msg.content

        # Extract citations from response and verify them against retrieved chunks
        citations = _verify_citations(
            _extract_citations(response_text), get_retrieved_chunks()
        )

        return {
            "response": response_text,
            "citations": citations,
            "tool_calls_made": tool_calls_count,
            "messages": final_messages,
        }

    def chat_stream(
        self,
        user_message: str,
        session_id: str = "default",
        user_mode: str = "citizen",
        history: list[BaseMessage] | None = None,
    ):
        """Stream the agent's response token by token.

        Yields dicts with:
            - type: "token" | "tool_call" | "done"
            - content: str
        """
        start_retrieval_run()

        messages = list(history or [])
        messages.append(HumanMessage(content=user_message))

        input_state = {
            "messages": messages,
            "user_mode": user_mode,
            "session_id": session_id,
        }

        for event in self.graph.stream(input_state, stream_mode="updates"):
            for node_name, node_output in event.items():
                if node_name == "agent":
                    msgs = node_output.get("messages", [])
                    for msg in msgs:
                        if isinstance(msg, AIMessage):
                            if msg.tool_calls:
                                for tc in msg.tool_calls:
                                    yield {
                                        "type": "tool_call",
                                        "content": f"Using tool: {tc['name']}",
                                    }
                            elif msg.content:
                                yield {
                                    "type": "token",
                                    "content": msg.content,
                                }
                elif node_name == "tools":
                    msgs = node_output.get("messages", [])
                    for msg in msgs:
                        if hasattr(msg, "content") and msg.content:
                            yield {
                                "type": "tool_result",
                                "content": msg.content[:200] + "..." if len(str(msg.content)) > 200 else str(msg.content),
                            }

        yield {"type": "done", "content": ""}


def _extract_citations(response_text: str) -> list[dict]:
    """Extract citation references from the response text (deduplicated).

    Handles the forms the model actually produces:
      - "Section 10 of the Contract Act"
      - "Sections 10, 14, and 15 of the Contract Act 1872" (lists)
      - "Section 54, Sale of Goods Act 1930" (comma form)
      - "Article 8 of the Constitution"
      - Bare "Section 14" mentions (e.g. markdown headings), attributed
        to the nearest act reference — or the only act mentioned.
    """
    import re

    if not response_text:
        return []

    # Act names: "Contract Act", "Pakistan Penal Code", "Transfer of Property
    # Act", "West Pakistan Land Revenue Ordinance", "the Constitution".
    act_pattern = (
        r"\b("
        r"[A-Z][A-Za-z]*(?:\s+(?:of|and|the|[A-Z][A-Za-z]*))*\s+(?:Act|Code|Ordinance)"
        r"|(?:The\s+|the\s+)?Constitution"
        r")\b"
    )
    # Section references, incl. lists: "Sections 10, 14, and 15".
    sec_pattern = (
        r"\b(?:Sections?|Sec\.?|Articles?|Arts?\.?)\s+"
        r"(\d+(?:-[A-Za-z0-9]+)?(?:\s*(?:,\s*(?:and\s+)?|and\s+|&\s*)\d+(?:-[A-Za-z0-9]+)?)*)"
    )
    # Generic references that are not real act names.
    _generic_acts = {"act", "the act", "this act", "said act", "an act", "any act", "code"}

    def _clean_act(name: str) -> str:
        name = re.sub(r"\s+", " ", name).strip(" ,.")
        return re.sub(r"^(?:The|the)\s+", "", name)

    act_matches = [
        (m.start(), m.end(), cleaned)
        for m in re.finditer(act_pattern, response_text)
        if (cleaned := _clean_act(m.group(1))) and cleaned.lower() not in _generic_acts
    ]
    if not act_matches:
        return []
    norm_acts: dict[str, str] = {}
    for _, _, a in act_matches:
        norm_acts.setdefault(_norm(a), a)

    citations: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for m in re.finditer(sec_pattern, response_text):
        numbers = re.findall(r"\d+(?:-[A-Za-z0-9]+)?", m.group(1))
        if not numbers:
            continue

        # Direct act reference right after: "of the X Act" / ", X Act"
        act = None
        rest = response_text[m.end():m.end() + 140]
        lead = re.match(r"\s*,?\s*(?:(?:of|under|per|in)\s+)?(?:the\s+)?", rest)
        if lead and lead.end() > 0:
            am = re.match(act_pattern, rest[lead.end():])
            if am:
                act = _clean_act(am.group(1))

        # Fall back to the nearest act reference (prefer preceding)
        if act is None or act.lower() in _generic_acts:
            pos = m.start()
            preceding = [t for t in act_matches if t[1] <= pos and pos - t[1] <= 400]
            following = [t for t in act_matches if t[0] >= m.end() and t[0] - m.end() <= 400]
            if preceding:
                act = max(preceding, key=lambda t: t[1])[2]
            elif following:
                act = min(following, key=lambda t: t[0])[2]
            elif len(norm_acts) == 1:
                act = next(iter(norm_acts.values()))
            else:
                continue

        for num in numbers:
            key = (_norm(num), _norm(act))
            if key in seen:
                continue
            seen.add(key)
            citations.append({"section": num, "act": act})

    return citations[:12]


def _norm(s: str) -> str:
    """Normalize for fuzzy act/section comparison (lowercase alphanumerics only)."""
    import re

    return re.sub(r"[^a-z0-9]", "", s.lower())


def _verify_citations(citations: list[dict], retrieved: list) -> list[dict]:
    """Mark each extracted citation as verified iff it maps to a retrieved chunk.

    A citation (act, section) is verified when some retrieved chunk's act name
    matches (normalized substring, either direction) AND its section number
    matches exactly (normalized). Verified citations also carry a snippet of
    the actual statute text so the UI can show the grounding evidence.
    """
    if not citations:
        return citations

    for c in citations:
        c_act = _norm(c.get("act", ""))
        c_sec = _norm(str(c.get("section", "")))
        verified = False

        for r in retrieved:
            chunk = r.chunk
            if not chunk.section_number:
                continue
            r_act = _norm(chunk.act_name)
            act_match = c_act and (c_act in r_act or r_act in c_act)
            if act_match and c_sec and c_sec == _norm(chunk.section_number):
                verified = True
                if not c.get("text_snippet"):
                    c["text_snippet"] = chunk.text[:400].strip()
                break

        c["verified"] = verified

    return citations
