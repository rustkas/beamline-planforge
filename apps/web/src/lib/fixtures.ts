import fixture from "../fixtures/kitchen_state.fixture.json";

export type KitchenStateLike = unknown;

export async function load_kitchen_state_fixture(): Promise<KitchenStateLike> {
  const clone = JSON.parse(JSON.stringify(fixture)) as KitchenStateLike;
  return clone;
}
