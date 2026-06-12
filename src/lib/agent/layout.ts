import dagre from "@dagrejs/dagre";

/**
 * Dagre auto-layout wrapper for the feature mind map (Step 51). Pure and
 * browser-safe — it runs inside the client-only React Flow canvas.
 *
 * Left-to-right ranking follows the link directions, which reads naturally
 * for an application graph (frontend → API → backend → …); stack grouping is
 * communicated by node color + the legend rather than hard lanes. Dagre packs
 * disconnected components side by side, so isolated features stay visible.
 */

export const MAP_NODE_WIDTH = 224;
export const MAP_NODE_HEIGHT = 72;

export interface LayoutInput {
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
  direction?: "LR" | "TB";
}

/** Returns top-left positions (React Flow convention) keyed by node id. */
export function layoutGraph({
  nodes,
  edges,
  direction = "LR",
}: LayoutInput): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 24,
    ranksep: 72,
    edgesep: 16,
    marginx: 16,
    marginy: 16,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    g.setNode(node.id, { width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT });
  }
  for (const edge of edges) {
    if (ids.has(edge.from) && ids.has(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(g);

  // Dagre yields center coordinates; React Flow wants top-left.
  return new Map(
    nodes.map((n) => {
      const pos = g.node(n.id);
      return [
        n.id,
        { x: pos.x - MAP_NODE_WIDTH / 2, y: pos.y - MAP_NODE_HEIGHT / 2 },
      ];
    }),
  );
}
