import { ITEMS } from '../utils/Constants.js';
import { el } from '../utils/Helpers.js';

const CATEGORY_LABELS = { resource: 'Resource', consumable: 'Consumable', weapon: 'Weapon', tool: 'Tool' };

/**
 * Detailed inventory screen (Tab). Lists stacks, shows item details and lets the
 * player use, assign to hotbar or drop items.
 */
export class InventoryUI {
  constructor(root, inventory, { onUse, onDrop, onClose, onOpenCrafting } = {}) {
    this.inventory = inventory;
    this.callbacks = { onUse, onDrop, onClose, onOpenCrafting };
    this.selected = null;
    this.isOpen = false;

    this.grid = el('div', 'inv-grid');
    this.details = el('div', 'inv-details');
    this.weightFill = el('div', 'weight-fill');
    this.weightText = el('span', 'weight-text');
    this.hotbarRow = el('div', 'inv-hotbar');

    const header = el('div', 'panel-header', {}, [
      el('h2', '', { text: '🎒 Inventory' }),
      el('div', 'weight-bar', {}, [this.weightFill, this.weightText]),
      el('button', 'btn small', { text: '🔨 Crafting (C)', type: 'button', onclick: () => this.callbacks.onOpenCrafting?.() }),
      el('button', 'btn small close', { text: '✕', type: 'button', title: 'Close (Tab)', onclick: () => this.callbacks.onClose?.() }),
    ]);

    this.panel = el('div', 'panel inventory-panel', {}, [
      header,
      el('div', 'inv-body', {}, [el('div', 'inv-left', {}, [this.grid, el('h3', '', { text: 'Hotbar' }), this.hotbarRow]), this.details]),
    ]);
    this.root = el('div', 'overlay hidden', {}, [this.panel]);
    root.appendChild(this.root);

    inventory.onChange(() => {
      if (this.isOpen) this.render();
    });
  }

  open() {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  render() {
    const inv = this.inventory;
    const list = inv.list();
    if (this.selected && !inv.has(this.selected)) this.selected = null;
    if (!this.selected && list.length) this.selected = list[0].id;

    const frac = Math.min(1, inv.getLoadFraction());
    this.weightFill.style.width = `${frac * 100}%`;
    this.weightFill.classList.toggle('heavy', frac > 0.75);
    this.weightText.textContent = `${inv.getTotalWeight().toFixed(1)} / ${inv.maxWeight} kg`;

    this.grid.innerHTML = '';
    if (!list.length) this.grid.appendChild(el('div', 'empty', { text: 'Your backpack is empty. Explore the city to scavenge supplies.' }));
    for (const { id, qty, item } of list) {
      const slot = el('button', `inv-slot ${id === this.selected ? 'selected' : ''} cat-${item.category}`, { type: 'button', title: item.name }, [
        el('span', 'slot-icon', { text: item.icon }),
        el('span', 'slot-name', { text: item.name }),
        el('span', 'slot-qty', { text: `×${qty}` }),
      ]);
      slot.addEventListener('click', () => {
        this.selected = id;
        this.render();
      });
      slot.addEventListener('dblclick', () => this._primaryAction(id));
      this.grid.appendChild(slot);
    }

    this.hotbarRow.innerHTML = '';
    inv.hotbar.forEach((id, i) => {
      const slot = el('button', `hotbar-slot ${i === inv.selectedSlot ? 'selected' : ''}`, { type: 'button', title: id ? `${ITEMS[id].name} — click to clear` : 'Empty' }, [
        el('span', 'slot-key', { text: String(i + 1) }),
        el('span', 'slot-icon', { text: id ? ITEMS[id].icon : '' }),
      ]);
      slot.addEventListener('click', () => {
        if (id) inv.assignHotbar(i, null);
        else inv.selectSlot(i);
      });
      this.hotbarRow.appendChild(slot);
    });

    this._renderDetails();
  }

  _primaryAction(id) {
    const item = ITEMS[id];
    if (item.category === 'consumable') this.callbacks.onUse?.(id);
    else if (item.category !== 'resource') {
      const slot = this.inventory.hotbar.indexOf(id);
      if (slot === -1) {
        const free = this.inventory.hotbar.indexOf(null);
        this.inventory.assignHotbar(free === -1 ? this.inventory.selectedSlot : free, id);
      }
      this.inventory.selectSlot(this.inventory.hotbar.indexOf(id));
    }
  }

  _renderDetails() {
    const d = this.details;
    d.innerHTML = '';
    const id = this.selected;
    if (!id) {
      d.appendChild(el('p', 'muted', { text: 'Select an item to see details.' }));
      return;
    }
    const item = ITEMS[id];
    const qty = this.inventory.count(id);
    d.append(
      el('div', 'detail-icon', { text: item.icon }),
      el('h3', '', { text: item.name }),
      el('div', 'detail-cat', { text: CATEGORY_LABELS[item.category] }),
      el('p', '', { text: item.description }),
      el('div', 'detail-row', { text: `Quantity: ${qty}` }),
      el('div', 'detail-row', { text: `Weight: ${item.weight} kg each (${(item.weight * qty).toFixed(1)} kg)` }),
    );
    if (item.weapon) {
      d.append(
        el('div', 'detail-row', { text: `Damage ${item.weapon.damage} · Range ${item.weapon.range} m · ${(1 / item.weapon.cooldown).toFixed(1)} swings/s` }),
      );
    }
    const actions = el('div', 'detail-actions');
    if (item.category === 'consumable') {
      actions.appendChild(el('button', 'btn', { text: 'Use', type: 'button', onclick: () => this.callbacks.onUse?.(id) }));
    }
    if (item.category !== 'resource') {
      const assign = el('div', 'assign-row', {}, [el('span', 'muted', { text: 'Hotbar:' })]);
      for (let i = 0; i < this.inventory.hotbar.length; i++) {
        const active = this.inventory.hotbar[i] === id;
        assign.appendChild(
          el('button', `btn tiny ${active ? 'active' : ''}`, {
            text: String(i + 1),
            type: 'button',
            onclick: () => this.inventory.assignHotbar(i, id),
          }),
        );
      }
      actions.appendChild(assign);
    }
    actions.appendChild(el('button', 'btn secondary', { text: 'Drop 1', type: 'button', onclick: () => this.callbacks.onDrop?.(id, 1) }));
    if (qty > 1) actions.appendChild(el('button', 'btn secondary', { text: 'Drop all', type: 'button', onclick: () => this.callbacks.onDrop?.(id, qty) }));
    d.appendChild(actions);
  }
}
