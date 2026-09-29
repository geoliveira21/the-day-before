import { ITEMS } from '../utils/Constants.js';
import { el } from '../utils/Helpers.js';

/**
 * Crafting panel (C). Recipes are grouped by category, with per-material
 * have/need indicators and a craft button that explains why it is disabled.
 */
export class CraftingUI {
  constructor(root, crafting, inventory, { onCraft, onClose, onOpenInventory } = {}) {
    this.crafting = crafting;
    this.inventory = inventory;
    this.callbacks = { onCraft, onClose, onOpenInventory };
    this.isOpen = false;

    this.list = el('div', 'craft-list');
    this.panel = el('div', 'panel crafting-panel', {}, [
      el('div', 'panel-header', {}, [
        el('h2', '', { text: '🔨 Crafting' }),
        el('span', 'muted', { text: 'Combine scavenged materials into gear.' }),
        el('button', 'btn small', { text: '🎒 Inventory (Tab)', type: 'button', onclick: () => this.callbacks.onOpenInventory?.() }),
        el('button', 'btn small close', { text: '✕', type: 'button', title: 'Close (C)', onclick: () => this.callbacks.onClose?.() }),
      ]),
      this.list,
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
    this.list.innerHTML = '';
    const groups = new Map();
    for (const r of this.crafting.recipes) {
      if (!groups.has(r.category)) groups.set(r.category, []);
      groups.get(r.category).push(r);
    }
    for (const [category, recipes] of groups) {
      this.list.appendChild(el('h3', 'craft-category', { text: category }));
      for (const recipe of recipes) this.list.appendChild(this._recipeCard(recipe));
    }
  }

  _recipeCard(recipe) {
    const out = ITEMS[recipe.output.id];
    const status = this.crafting.check(recipe.id);
    const reqs = el('div', 'craft-reqs');
    for (const [id, qty] of Object.entries(recipe.requires)) {
      const have = this.inventory.count(id);
      reqs.appendChild(
        el('span', `req ${have >= qty ? 'ok' : 'missing'}`, { title: ITEMS[id].name }, [
          el('span', '', { text: `${ITEMS[id].icon} ${ITEMS[id].name} ` }),
          el('b', '', { text: `${have}/${qty}` }),
        ]),
      );
    }
    const button = el('button', 'btn', {
      text: status.ok ? 'Craft' : status.reason,
      type: 'button',
      onclick: () => {
        const result = this.crafting.craft(recipe.id);
        this.callbacks.onCraft?.(recipe, result);
        this.render();
      },
    });
    button.disabled = !status.ok;
    return el('div', `craft-card ${status.ok ? 'can' : ''}`, {}, [
      el('div', 'craft-icon', { text: out.icon }),
      el('div', 'craft-info', {}, [
        el('div', 'craft-name', { text: `${out.name}${recipe.output.qty > 1 ? ` ×${recipe.output.qty}` : ''}` }),
        el('div', 'craft-desc muted', { text: out.description }),
        reqs,
      ]),
      button,
    ]);
  }
}
