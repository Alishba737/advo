"""Tool definitions for the ADVO agent — callable by Qwen2.5 via LangGraph."""

from __future__ import annotations

import contextvars

from langchain_core.tools import tool

from packages.shared.models import RetrievalResult


# Global references set during agent initialization
_retriever = None
_knowledge_graph = None

# Chunks retrieved during the current agent run, used to verify citations.
# A ContextVar keeps concurrent requests (e.g. interleaved SSE streams) from
# mixing each other's retrievals.
_current_run_chunks: contextvars.ContextVar[list[RetrievalResult] | None] = (
    contextvars.ContextVar("advo_retrieved_chunks", default=None)
)


def start_retrieval_run() -> None:
    """Begin a new retrieval run — call before each agent invocation."""
    _current_run_chunks.set([])


def get_retrieved_chunks() -> list[RetrievalResult]:
    """Return the chunks retrieved during the current (or last) run."""
    return list(_current_run_chunks.get() or [])


def _record_retrieval(results: list[RetrievalResult]) -> None:
    """Record retrieval results if a run is active."""
    chunks = _current_run_chunks.get()
    if chunks is not None:
        chunks.extend(results)


def set_retriever(retriever) -> None:
    global _retriever
    _retriever = retriever


def set_knowledge_graph(kg) -> None:
    global _knowledge_graph
    _knowledge_graph = kg


@tool
def legal_search(query: str, domain: str = "", top_k: int = 6) -> str:
    """Search the Pakistani legal knowledge base for relevant provisions.

    Use this tool to find relevant laws, sections, and articles from Pakistani legislation.
    Returns legal provisions with citations.

    Args:
        query: The legal question or topic to search for
        domain: Optional domain filter (employment, contract, criminal, family, property, constitutional)
        top_k: Number of results to return (default 6)
    """
    if _retriever is None:
        return "Error: Legal search is not initialized."

    domain_filter = [domain] if domain else None
    results: list[RetrievalResult] = _retriever.retrieve(
        query, top_k=top_k, domain_filter=domain_filter
    )
    _record_retrieval(results)

    if not results:
        return "No relevant legal provisions found for this query."

    output_parts = []
    for i, r in enumerate(results, 1):
        act = r.chunk.act_name
        section = f", Section {r.chunk.section_number}" if r.chunk.section_number else ""
        source_tag = f" [{r.source}]" if r.source != "vector" else ""
        output_parts.append(
            f"[{i}] **{act}{section}**{source_tag} (score: {r.score:.2f})\n"
            f"    {r.chunk.text[:500]}"
        )
        if r.graph_path:
            output_parts.append(f"    Connected via: {' → '.join(r.graph_path)}")

    return "\n\n".join(output_parts)


@tool
def detect_legal_domain(query: str) -> str:
    """Detect the legal domain(s) relevant to a user's query.

    Returns one or more domain tags from: employment, contract, criminal,
    family, property, constitutional.

    Args:
        query: The user's legal question or description
    """
    query_lower = query.lower()
    domain_keywords = {
        "employment": ["job", "employ", "fire", "fired", "terminated", "salary", "wage",
                       "work", "worker", "labour", "labor", "dismissal", "notice period",
                       "overtime", "employer", "employee", "resign", "suspension"],
        "contract": ["contract", "agreement", "breach", "promise", "offer", "accept",
                     "consideration", "void", "voidable", "consent", "fraud", "coercion",
                     "damages", "obligation", "party"],
        "criminal": ["crime", "offence", "punishment", "jail", "prison", "arrest", "bail",
                     "murder", "theft", "assault", "fraud", "accused", "police", "FIR",
                     "complaint", "cognizable"],
        "family": ["marriage", "divorce", "custody", "maintenance", "dower", "mahr",
                   "guardian", "minor", "child", "nikah", "iddat", "khula", "talaq",
                   "dissolution", "inheritance"],
        "property": ["property", "land", "house", "rent", "tenant", "landlord", "lease",
                     "eviction", "possession", "transfer", "sale", "mortgage", "deed"],
        "constitutional": ["constitution", "fundamental right", "article", "supreme court",
                          "high court", "federation", "province", "parliament", "assembly",
                          "freedom", "equality", "liberty"],
    }

    detected = []
    for domain, keywords in domain_keywords.items():
        if any(kw in query_lower for kw in keywords):
            detected.append(domain)

    if detected:
        return f"Detected domains: {', '.join(detected)}"
    return "No specific domain detected. General legal query."


@tool
def explain_legal_concept(concept: str) -> str:
    """Look up and explain a legal concept or term from Pakistani law.

    Use this when the user asks about a specific legal concept, doctrine, or term.

    Args:
        concept: The legal concept or term to explain (e.g., 'consideration', 'habeas corpus')
    """
    if _retriever is None:
        return "Error: Legal search is not initialized."

    # Search for the concept in the legal knowledge base
    results = _retriever.retrieve(f"definition of {concept}", top_k=3)
    _record_retrieval(results)

    if not results:
        return f"No specific provisions found for '{concept}' in the legal knowledge base."

    output = f"Legal concept: **{concept}**\n\nRelevant provisions found:\n"
    for r in results:
        act = r.chunk.act_name
        section = f"Section {r.chunk.section_number}" if r.chunk.section_number else "General"
        output += f"\n- **{act}, {section}**: {r.chunk.text[:300]}"

    return output


# List of all tools available to the agent
ADVO_TOOLS = [legal_search, detect_legal_domain, explain_legal_concept]
