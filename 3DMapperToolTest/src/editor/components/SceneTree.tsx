import type { SceneTreeNode } from '../../domain/sceneTree';
import { Icon } from './Icon';

interface SceneTreeProps {
  nodes: SceneTreeNode[];
  selectedNodeId: string | null;
  onSelect: (node: SceneTreeNode) => void;
}

export function SceneTree({ nodes, selectedNodeId, onSelect }: SceneTreeProps) {
  return (
    <section className="scene-tree">
      <div className="scene-tree-heading"><h2>SCENE TREE</h2><span>{nodes.length}</span></div>
      <div className="scene-tree-list">
        {nodes.map((node) => (
          <button
            type="button"
            key={node.id}
            className={`scene-tree-row${node.id === selectedNodeId ? ' selected' : ''}`}
            style={{ paddingLeft: `${12 + node.depth * 14}px` }}
            onClick={() => onSelect(node)}
          >
            <Icon name={node.type === 'group' ? 'cube' : 'mesh'} size={14} />
            <span>{node.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
