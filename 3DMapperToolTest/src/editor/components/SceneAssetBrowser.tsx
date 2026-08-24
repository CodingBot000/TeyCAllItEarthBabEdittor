interface SceneAssetBrowserProps {
  selected: boolean;
  onSelect: () => void;
}

export function SceneAssetBrowser({ selected, onSelect }: SceneAssetBrowserProps) {
  return (
    <section className="scene-asset-browser" aria-label="Scene assets">
      <div className="scene-asset-card">
        <div className="scene-asset-icon">JC</div>
        <div className="scene-asset-copy"><strong>JC LP MEGACITY</strong><span>INTEGRATED SCENE · 4,160 OBJECTS</span><small>LOCAL GLB · 211 MB</small></div>
        <button type="button" className={selected ? 'selected' : ''} onClick={onSelect}>{selected ? 'LOADED' : 'LOAD SCENE'}</button>
      </div>
      <p className="scene-asset-note">Loads the integrated GLB on demand. The original parent hierarchy and mesh pick metadata remain separate from editable catalog instances.</p>
    </section>
  );
}
