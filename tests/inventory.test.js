import { describe, expect, it, vi } from 'vitest';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { CraftingSystem } from '../src/systems/CraftingSystem.js';
import { ITEMS, RECIPES } from '../src/utils/Constants.js';

describe('InventorySystem', () => {
  it('adds and removes stacks', () => {
    const inv = new InventorySystem();
    expect(inv.add('wood', 3)).toBe(3);
    expect(inv.count('wood')).toBe(3);
    expect(inv.remove('wood', 5)).toBe(false);
    expect(inv.remove('wood', 3)).toBe(true);
    expect(inv.count('wood')).toBe(0);
    expect(inv.add('not_an_item')).toBe(0);
  });

  it('enforces the weight limit', () => {
    const inv = new InventorySystem({ maxWeight: 5 });
    const added = inv.add('scrap_metal', 10);
    expect(added).toBe(Math.floor(5 / ITEMS.scrap_metal.weight));
    expect(inv.getTotalWeight()).toBeLessThanOrEqual(5);
    expect(inv.canAdd('scrap_metal')).toBe(false);
    expect(inv.getLoadFraction()).toBeLessThanOrEqual(1);
  });

  it('auto-assigns non-resource items to the hotbar', () => {
    const inv = new InventorySystem();
    inv.add('wood', 2);
    inv.add('crowbar');
    inv.add('bandage', 2);
    expect(inv.hotbar[0]).toBe('crowbar');
    expect(inv.hotbar[1]).toBe('bandage');
    expect(inv.hotbar).not.toContain('wood');
    expect(inv.getEquippedWeapon()?.id).toBe('crowbar');
    inv.cycleSlot(1);
    expect(inv.getSelectedId()).toBe('bandage');
    expect(inv.getEquippedWeapon()).toBeNull();
    inv.cycleSlot(-2);
    expect(inv.selectedSlot).toBe(inv.hotbar.length - 1);
    inv.remove('bandage', 2);
    expect(inv.hotbar).not.toContain('bandage');
  });

  it('moves items between hotbar slots and notifies listeners', () => {
    const inv = new InventorySystem();
    const cb = vi.fn();
    inv.onChange(cb);
    inv.add('crowbar');
    expect(inv.assignHotbar(3, 'crowbar')).toBe(true);
    expect(inv.hotbar.indexOf('crowbar')).toBe(3);
    expect(inv.assignHotbar(2, 'pickaxe')).toBe(false);
    expect(cb).toHaveBeenCalled();
  });

  it('detects tools', () => {
    const inv = new InventorySystem();
    expect(inv.hasTool('pickaxe')).toBe(false);
    inv.add('pickaxe');
    expect(inv.hasTool('pickaxe')).toBe(true);
  });
});

describe('CraftingSystem', () => {
  it('every recipe references known items', () => {
    for (const r of RECIPES) {
      expect(ITEMS[r.output.id]).toBeDefined();
      for (const id of Object.keys(r.requires)) expect(ITEMS[id]).toBeDefined();
    }
  });

  it('reports missing materials', () => {
    const inv = new InventorySystem();
    const crafting = new CraftingSystem(inv);
    inv.add('cloth', 1);
    const status = crafting.check('bandage');
    expect(status.ok).toBe(false);
    expect(status.missing).toEqual({ cloth: 1 });
    expect(crafting.check('nope').ok).toBe(false);
  });

  it('consumes materials and produces output', () => {
    const inv = new InventorySystem();
    const crafting = new CraftingSystem(inv);
    inv.add('scrap_metal', 3);
    inv.add('cloth', 2);
    const result = crafting.craft('metal_pipe');
    expect(result.ok).toBe(true);
    expect(inv.count('metal_pipe')).toBe(1);
    expect(inv.count('scrap_metal')).toBe(0);
    expect(inv.count('cloth')).toBe(1);
  });

  it('refuses crafts that would exceed carrying capacity', () => {
    const inv = new InventorySystem({ maxWeight: 1 });
    const heavyRecipe = { id: 'heavy', output: { id: 'scrap_metal', qty: 2 }, requires: { cloth: 1 } };
    const crafting = new CraftingSystem(inv, [heavyRecipe]);
    inv.add('cloth', 1);
    const result = crafting.craft('heavy');
    expect(result).toEqual({ ok: false, reason: 'Too heavy to carry' });
    expect(inv.count('cloth')).toBe(1);
    expect(inv.count('scrap_metal')).toBe(0);
  });
});
