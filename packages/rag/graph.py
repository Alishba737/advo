"""Legal Knowledge Graph — loads, builds, and queries cross-reference graphs."""

from __future__ import annotations

import json
import re
from pathlib import Path

from packages.shared.models import GraphNode, GraphEdge, LegalGraph


class KnowledgeGraph:
    """In-memory legal knowledge graph for cross-reference expansion."""

    def __init__(self) -> None:
        self.graph = LegalGraph()
        self._node_index: dict[str, GraphNode] = {}
        self._adjacency: dict[str, list[tuple[str, str]]] = {}  # node_id -> [(target_id, relation)]

    def load(self, path: Path) -> None:
        """Load graph from JSON file."""
        if not path.exists():
            print(f"  Warning: Graph file not found at {path}. Starting empty.")
            return

        data = json.loads(path.read_text(encoding="utf-8"))
        self.graph = LegalGraph(
            nodes=[GraphNode(**n) for n in data.get("nodes", [])],
            edges=[GraphEdge(**e) for e in data.get("edges", [])],
        )
        self._build_index()
        print(f"  Loaded graph: {len(self.graph.nodes)} nodes, {len(self.graph.edges)} edges")

    def save(self, path: Path) -> None:
        """Save graph to JSON file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "nodes": [n.model_dump() for n in self.graph.nodes],
            "edges": [e.model_dump() for e in self.graph.edges],
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"  Saved graph to {path}")

    def _build_index(self) -> None:
        """Build lookup indexes for fast traversal."""
        self._node_index = {n.id: n for n in self.graph.nodes}
        self._adjacency = {}
        for edge in self.graph.edges:
            self._adjacency.setdefault(edge.source, []).append(
                (edge.target, edge.relation)
            )
            # Bidirectional for retrieval expansion
            self._adjacency.setdefault(edge.target, []).append(
                (edge.source, f"reverse_{edge.relation}")
            )

    def add_node(self, node: GraphNode) -> None:
        if node.id not in self._node_index:
            self.graph.nodes.append(node)
            self._node_index[node.id] = node

    def add_edge(self, edge: GraphEdge) -> None:
        self.graph.edges.append(edge)
        self._adjacency.setdefault(edge.source, []).append(
            (edge.target, edge.relation)
        )
        self._adjacency.setdefault(edge.target, []).append(
            (edge.source, f"reverse_{edge.relation}")
        )

    def get_neighbors(
        self, node_id: str, hops: int = 1
    ) -> list[tuple[GraphNode, str, int]]:
        """Get neighboring nodes up to N hops away.
        Returns list of (node, relation_path, distance)."""
        visited: set[str] = {node_id}
        results: list[tuple[GraphNode, str, int]] = []
        frontier = [(node_id, "", 0)]

        while frontier:
            current_id, path, depth = frontier.pop(0)
            if depth >= hops:
                continue

            for neighbor_id, relation in self._adjacency.get(current_id, []):
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    new_path = f"{path} -> {relation}" if path else relation
                    node = self._node_index.get(neighbor_id)
                    if node:
                        results.append((node, new_path, depth + 1))
                        frontier.append((neighbor_id, new_path, depth + 1))

        return results

    def get_node(self, node_id: str) -> GraphNode | None:
        return self._node_index.get(node_id)

    def get_node_ids_for_act(self, act_name: str) -> list[str]:
        """Get all node IDs belonging to a specific act."""
        safe_act = re.sub(r"[^a-zA-Z0-9]", "_", act_name).lower().strip("_")
        return [n.id for n in self.graph.nodes if safe_act in n.id]


def build_graph_from_chunks_and_llm(
    chunks: list,
    output_path: Path,
) -> KnowledgeGraph:
    """Build initial graph nodes from parsed chunks.

    Creates one node per unique (act, section) pair.
    Edges (cross-references) are added later via LLM extraction or manual curation.
    """
    kg = KnowledgeGraph()
    seen: set[str] = set()

    for chunk in chunks:
        if not chunk.graph_node_id or chunk.graph_node_id in seen:
            continue
        seen.add(chunk.graph_node_id)

        node = GraphNode(
            id=chunk.graph_node_id,
            type="provision",
            act=chunk.act_name,
            section=chunk.section_number or "preamble",
            title=f"Section {chunk.section_number}" if chunk.section_number else "Preamble",
            domain_tags=chunk.domain_tags,
            summary=chunk.text[:200],
        )
        kg.add_node(node)

    # Auto-detect domain-based connections (lightweight graph edges)
    # Nodes in the same domain get "related_to" edges
    domain_groups: dict[str, list[str]] = {}
    for node in kg.graph.nodes:
        for tag in node.domain_tags:
            domain_groups.setdefault(tag, []).append(node.id)

    # Only connect nodes within the same domain that are in DIFFERENT acts
    for domain, node_ids in domain_groups.items():
        acts_seen: dict[str, str] = {}
        for nid in node_ids:
            node = kg.get_node(nid)
            if not node:
                continue
            if node.act in acts_seen:
                # Same domain, different section in same act — already connected
                continue
            if acts_seen:
                # Connect to first node from a different act in this domain
                other_id = next(iter(acts_seen.values()))
                kg.add_edge(
                    GraphEdge(
                        source=nid,
                        target=other_id,
                        relation=f"related_via_{domain}",
                    )
                )
            acts_seen[node.act] = nid

    kg.save(output_path)
    print(f"  Built graph: {len(kg.graph.nodes)} nodes, {len(kg.graph.edges)} edges")
    return kg
