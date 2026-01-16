import plugin_manifest_schema from "../schemas/plugin-manifest.schema.json";
import kitchen_state_schema from "../schemas/kitchen_state.schema.json";
import render_model_schema from "../schemas/render_model.schema.json";
import render_node_schema from "../schemas/render_node.schema.json";
import room_schema from "../schemas/room.schema.json";
import layout_schema from "../schemas/layout.schema.json";
import layout_object_schema from "../schemas/layout_object.schema.json";
import opening_schema from "../schemas/opening.schema.json";
import utility_point_schema from "../schemas/utility_point.schema.json";
import rect_zone_schema from "../schemas/rect_zone.schema.json";
import point2_mm_schema from "../schemas/point2_mm.schema.json";
import transform2d_mm_schema from "../schemas/transform2d_mm.schema.json";
import transform3d_schema from "../schemas/transform3d.schema.json";

export function get_all_schemas(): readonly object[] {
  return [
    plugin_manifest_schema,
    kitchen_state_schema,
    render_model_schema,
    render_node_schema,
    room_schema,
    layout_schema,
    layout_object_schema,
    opening_schema,
    utility_point_schema,
    rect_zone_schema,
    point2_mm_schema,
    transform2d_mm_schema,
    transform3d_schema
  ] as const;
}
