import { topologicalSort } from './topologicalSort';
import { marked } from 'marked';

// Helper to determine media type from filename
function getMediaType(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'ogg'].includes(extension)) {
    return 'video';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extension)) {
    return 'image';
  }
  return 'unknown'; // Or handle as needed
}

// Helper to create a default alt text
function createAltText(filename) {
    // Remove path and extension
    const nameWithoutPath = filename.split('/').pop();
    const nameWithoutExtension = nameWithoutPath.split('.').slice(0, -1).join('.');
    // Basic capitalization and space replacement
    return nameWithoutExtension
        .replace(/([A-Z])/g, ' $1') // Add space before capitals
        .replace(/[-_]/g, ' ') // Replace hyphens/underscores with spaces
        .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
        .trim();
}

// Helper to transform the media path
function transformMediaPath(filePath) {
  const firstSlashIndex = filePath.indexOf('/');
  if (firstSlashIndex !== -1) {
      // Found a directory separator, replace the part before it with 'media'
      const restOfPath = filePath.substring(firstSlashIndex + 1);
      return `/media/${restOfPath}`;
  } else {
      // No directory found in the path. Prefix with /media/.
      // This might indicate an unexpected path structure in the canvas file.
      console.warn(`Media path "${filePath}" does not contain a directory separator '/'. Placing it directly under /media/.`);
      return `/media/${filePath}`;
  }
}


export function parseCanvas(canvasData) {
  const { nodes, edges } = canvasData;

  if (!nodes || !edges) {
    console.error("Invalid canvas data: missing nodes or edges.");
    return [];
  }

  const nodesMap = new Map(nodes.map(node => [node.id, node]));
  const adj = new Map(); // Adjacency list for directed edges
  const inDegree = new Map(); // In-degree count for directed edges
  const pairs = new Map(); // Map node ID -> paired node ID (via undirected edge)
  const nodeIdsInDirectedGraph = new Set();

  // Initialize adjacency list and in-degree map
  nodes.forEach(node => {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  // Process edges
  edges.forEach(edge => {
    const { fromNode, toNode, toEnd } = edge;

    // Check if nodes exist
    if (!nodesMap.has(fromNode) || !nodesMap.has(toNode)) {
        console.warn(`Edge ${edge.id} connects non-existent nodes. Skipping.`);
        return;
    }

    // Undirected edge (for pairing)
    if (toEnd === 'none') {
      const node1 = nodesMap.get(fromNode);
      const node2 = nodesMap.get(toNode);

      // Pair file node with text node
      if (node1.type === 'file' && node2.type === 'text') {
        pairs.set(fromNode, toNode);
        pairs.set(toNode, fromNode); // Store bidirectional pairing
      } else if (node1.type === 'text' && node2.type === 'file') {
        pairs.set(fromNode, toNode);
        pairs.set(toNode, fromNode); // Store bidirectional pairing
      }
       // else: Ignore pairs not between file and text
    }
    // Directed edge (for topological sort)
    else {
      if (!adj.has(fromNode)) adj.set(fromNode, []); // Ensure fromNode exists in adj
      adj.get(fromNode).push(toNode);
      inDegree.set(toNode, (inDegree.get(toNode) || 0) + 1);
      nodeIdsInDirectedGraph.add(fromNode);
      nodeIdsInDirectedGraph.add(toNode);
    }
  });

  // Filter nodes for topological sort (only those involved in directed edges)
  const nodesForSort = nodes.filter(node => nodeIdsInDirectedGraph.has(node.id));
  const sortedNodeIds = topologicalSort(nodesForSort.map(n => n.id), adj, inDegree);

  if (!sortedNodeIds) {
      console.error("Cycle detected in directed graph or error during sort. Cannot generate content blocks.");
      return [];
  }

  const contentBlocks = [];
  const processedNodes = new Set(); // Keep track of nodes already added to a block

  sortedNodeIds.forEach(nodeId => {
    if (processedNodes.has(nodeId)) {
      return; // Skip if already processed as part of a pair
    }

    const node = nodesMap.get(nodeId);
    if (!node) return; // Should not happen if sortedNodeIds is correct

    const pairedNodeId = pairs.get(nodeId);
    const pairedNode = pairedNodeId ? nodesMap.get(pairedNodeId) : null;

    let block = { type: 'block', media: undefined, text: undefined };

    if (pairedNode && !processedNodes.has(pairedNodeId)) {
      // Create a paired block
      let mediaNode, textNode;
      if (node.type === 'file' && pairedNode.type === 'text') {
        mediaNode = node;
        textNode = pairedNode;
      } else if (node.type === 'text' && pairedNode.type === 'file') {
        mediaNode = pairedNode;
        textNode = node;
      } else {
         // This case shouldn't be reached if pairs map is built correctly,
         // but handle defensively: treat node as standalone.
         console.warn(`Node ${nodeId} paired with unexpected node type ${pairedNode.type}. Treating ${nodeId} as standalone.`);
         if (node.type === 'file') {
             const mediaType = getMediaType(node.file);
             if (mediaType !== 'unknown') {
                 block.media = {
                     type: mediaType,
                     src: transformMediaPath(node.file),
                     alt: createAltText(node.file)
                 };
             }
         } else if (node.type === 'text') {
             block.text = node.text ? marked.parse(node.text) : ''; // Parse Markdown here
         }
         processedNodes.add(nodeId);
         contentBlocks.push(block);
         return; // Move to next node in sorted list
      }

      // We have a valid media/text pair
      const mediaType = getMediaType(mediaNode.file);
      if (mediaType !== 'unknown') {
          block.media = {
              type: mediaType,
              src: transformMediaPath(mediaNode.file),
              alt: createAltText(mediaNode.file)
          };
      }
      block.text = textNode.text ? marked.parse(textNode.text) : ''; // Parse Markdown here

      processedNodes.add(nodeId);
      processedNodes.add(pairedNodeId);

    } else {
      // Create a standalone block (node is not paired or its pair was already processed)
      if (node.type === 'file') {
        const mediaType = getMediaType(node.file);
        if (mediaType !== 'unknown') {
            block.media = {
                type: mediaType,
                src: transformMediaPath(node.file),
                alt: createAltText(node.file)
            };
        } else {
            console.warn(`Node ${nodeId} has unknown media type for file: ${node.file}. Skipping media.`);
        }
      } else if (node.type === 'text') {
        block.text = node.text ? marked.parse(node.text) : ''; // Parse Markdown here
      }
      processedNodes.add(nodeId);
    }

    // Only add block if it has some content
    if (block.media || block.text) {
        contentBlocks.push(block);
    } else {
        console.warn(`Node ${nodeId} resulted in an empty block. Skipping.`);
    }
  });

    // Optional: Handle nodes not part of the main directed graph?
    // For now, we only process nodes from the topologically sorted list.

  return contentBlocks;
}
