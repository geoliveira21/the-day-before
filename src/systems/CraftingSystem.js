import { RECIPES } from '../utils/Constants.js';

/**
 * Recipe-based crafting on top of an InventorySystem.
 */
export class CraftingSystem {
  constructor(inventory, recipes = RECIPES) {
    this.inventory = inventory;
    this.recipes = recipes;
  }

  getRecipe(recipeId) {
    return this.recipes.find((r) => r.id === recipeId) || null;
  }

  /** Net weight change after crafting (output weight minus consumed inputs). */
  weightDelta(recipe) {
    const items = this.inventory.items;
    let delta = (items[recipe.output.id]?.weight || 0) * recipe.output.qty;
    for (const [id, qty] of Object.entries(recipe.requires)) delta -= (items[id]?.weight || 0) * qty;
    return delta;
  }

  /**
   * Checks whether a recipe can be crafted.
   * @returns {{ ok: boolean, reason?: string, missing?: Record<string, number> }}
   */
  check(recipeId) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return { ok: false, reason: 'Unknown recipe' };
    const missing = {};
    for (const [id, qty] of Object.entries(recipe.requires)) {
      const have = this.inventory.count(id);
      if (have < qty) missing[id] = qty - have;
    }
    if (Object.keys(missing).length > 0) return { ok: false, reason: 'Missing materials', missing };
    if (this.weightDelta(recipe) > this.inventory.getFreeWeight() + 1e-6) {
      return { ok: false, reason: 'Too heavy to carry' };
    }
    return { ok: true };
  }

  canCraft(recipeId) {
    return this.check(recipeId).ok;
  }

  /**
   * Consumes the materials and adds the output.
   * @returns {{ ok: boolean, reason?: string, output?: {id: string, qty: number} }}
   */
  craft(recipeId) {
    const status = this.check(recipeId);
    if (!status.ok) return status;
    const recipe = this.getRecipe(recipeId);
    for (const [id, qty] of Object.entries(recipe.requires)) this.inventory.remove(id, qty);
    const added = this.inventory.add(recipe.output.id, recipe.output.qty);
    if (added < recipe.output.qty) {
      // Should never happen thanks to the weight check, but never lose materials.
      if (added > 0) this.inventory.remove(recipe.output.id, added);
      for (const [id, qty] of Object.entries(recipe.requires)) this.inventory.add(id, qty);
      return { ok: false, reason: 'Too heavy to carry' };
    }
    return { ok: true, output: { ...recipe.output } };
  }
}
