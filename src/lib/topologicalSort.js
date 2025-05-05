// Kahn's algorithm for Topological Sort
export function topologicalSort(nodeIds, adj, inDegree) {
  const queue = [];
  const sortedList = [];
  const localInDegree = new Map(inDegree); // Use a local copy

  // Initialize queue with nodes having in-degree 0
  nodeIds.forEach(nodeId => {
    if ((localInDegree.get(nodeId) || 0) === 0) {
      queue.push(nodeId);
    }
  });

  while (queue.length > 0) {
    const u = queue.shift();
    sortedList.push(u);

    const neighbors = adj.get(u) || [];
    neighbors.forEach(v => {
      localInDegree.set(v, (localInDegree.get(v) || 0) - 1);
      if ((localInDegree.get(v) || 0) === 0) {
        queue.push(v);
      }
    });
  }

  // Check for cycles
  if (sortedList.length !== nodeIds.length) {
    console.error("Cycle detected in the graph!");
    // Find nodes involved in the cycle (optional, for better debugging)
    const nodesInCycle = nodeIds.filter(id => !sortedList.includes(id));
    console.error("Nodes potentially in cycle:", nodesInCycle);
    return null; // Indicate error
  }

  return sortedList;
}
