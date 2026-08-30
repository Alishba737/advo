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
from packages.agent.tools import ADVO_TOOLS, set_retriever, set_knowledge_graph


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

        # Extract citations from response
        citations = _extract_citations(response_text)

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
    """Extract citation patterns from the response text."""
    import re

    citations = []
    # Match patterns like "Section X of the Y Act" or "Article X"
    pattern = r"(?:Section|Article|Sec\.?)\s+(\d+[-A-Za-z]*)\s+(?:of\s+(?:the\s+)?)([A-Z][A-Za-z\s]+?Act|Constitution|Ordinance|Code)"
    for match in re.finditer(pattern, response_text):
        citations.append({
            "section": match.group(1),
            "act": match.group(2).strip(),
        })

    return citations
