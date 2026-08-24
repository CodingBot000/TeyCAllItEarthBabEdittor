import type { MaterialSlotInfo } from '../../domain/materialSlots';
import { Icon } from './Icon';

interface MaterialSlotsProps {
  slots: MaterialSlotInfo[];
  selectedSlotId: string | null;
  onSelect: (id: string) => void;
}

export function MaterialSlots({ slots, selectedSlotId, onSelect }: MaterialSlotsProps) {
  return (
    <section className="inspector-section material-slots-section">
      <div className="section-header"><h2>MATERIAL SLOTS</h2><span className="section-index">05</span></div>
      {slots.length === 0 ? <div className="material-empty">SELECT A MESH TO VIEW MATERIALS</div> : (
        <div className="material-slot-list">
          {slots.map((slot) => (
            <button type="button" key={slot.id} className={`material-slot-row${slot.id === selectedSlotId || slot.selected ? ' selected' : ''}`} onClick={() => onSelect(slot.id)}>
              <span className="material-slot-icon"><Icon name="mesh" size={14} /></span>
              <span className="material-slot-copy"><strong>{slot.name}</strong><span>{slot.meshName} · {slot.type}</span></span>
              <span className="material-slot-texture">{slot.textureName ? 'TEXTURED' : 'NO TEXTURE'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
