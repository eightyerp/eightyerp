export const WINDOW_ANALYSIS_SCHEMA_VERSION = "1.0" as const;

export const WINDOW_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "analysis_status",
    "location",
    "photo_quality",
    "observations",
    "component_status",
    "moisture_assessment",
    "overall_level",
    "urgent_flags",
    "staff_questions",
    "recommended_actions",
    "summary_for_staff",
    "draft_customer_summary",
    "disclaimer",
  ],
  properties: {
    schema_version: { type: "string", const: WINDOW_ANALYSIS_SCHEMA_VERSION },
    analysis_status: {
      type: "string",
      enum: ["completed", "needs_retake", "insufficient_evidence", "invalid_subject"],
    },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["location_id", "location_name"],
      properties: {
        location_id: { type: "string" },
        location_name: { type: "string" },
      },
    },
    photo_quality: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "issues", "retake_requests"],
      properties: {
        overall: { type: "string", enum: ["pass", "warning", "fail"] },
        issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["photo_id", "code", "description"],
            properties: {
              photo_id: { type: "string" },
              code: {
                type: "string",
                enum: [
                  "blur",
                  "dark",
                  "backlight",
                  "obstruction",
                  "too_far",
                  "too_close",
                  "wrong_subject",
                  "possible_duplicate",
                  "missing_area",
                ],
              },
              description: { type: "string" },
            },
          },
        },
        retake_requests: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["required_category", "reason", "instruction"],
            properties: {
              required_category: { type: "string" },
              reason: { type: "string" },
              instruction: { type: "string" },
            },
          },
        },
      },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "evidence_photo_ids",
          "photo_category",
          "finding_code",
          "observation",
          "severity",
          "confidence",
          "directly_visible",
          "limitation",
        ],
        properties: {
          evidence_photo_ids: { type: "array", items: { type: "string" } },
          photo_category: { type: "string" },
          finding_code: { type: "string" },
          observation: { type: "string" },
          severity: { type: "string", enum: ["none", "low", "medium", "high"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          directly_visible: { type: "boolean" },
          limitation: { type: "string" },
        },
      },
    },
    component_status: {
      type: "object",
      additionalProperties: false,
      required: ["frame", "glass", "sealant", "rail_drainage", "hardware"],
      properties: {
        frame: { type: "string", enum: ["good", "check", "suspected_issue", "undetermined"] },
        glass: { type: "string", enum: ["good", "check", "suspected_issue", "undetermined"] },
        sealant: { type: "string", enum: ["good", "check", "suspected_issue", "undetermined"] },
        rail_drainage: { type: "string", enum: ["good", "check", "suspected_issue", "undetermined"] },
        hardware: { type: "string", enum: ["good", "check", "suspected_issue", "undetermined"] },
      },
    },
    moisture_assessment: {
      type: "object",
      additionalProperties: false,
      required: [
        "surface_condensation",
        "insulated_glass_fogging",
        "water_intrusion_trace",
        "active_water_visible",
        "cause_confirmed",
        "possible_causes",
        "limitations",
      ],
      properties: {
        surface_condensation: { type: "string", enum: ["none", "possible", "visible", "undetermined"] },
        insulated_glass_fogging: { type: "string", enum: ["none", "possible", "visible", "undetermined"] },
        water_intrusion_trace: { type: "string", enum: ["none", "possible", "visible", "undetermined"] },
        active_water_visible: { type: "boolean" },
        cause_confirmed: { type: "boolean", const: false },
        possible_causes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["code", "label", "confidence"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "indoor_condensation",
                  "drainage_issue",
                  "external_sealant",
                  "wall_entry",
                  "upper_structure",
                  "unknown",
                ],
              },
              label: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium"] },
            },
          },
        },
        limitations: { type: "array", items: { type: "string" } },
      },
    },
    overall_level: {
      type: "string",
      enum: ["good", "maintenance", "repair_check", "expert_check", "replacement_review", "undetermined"],
    },
    urgent_flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "description"],
        properties: {
          code: {
            type: "string",
            enum: ["broken_glass", "sash_fall_risk", "lock_failure", "active_heavy_leak"],
          },
          description: { type: "string" },
        },
      },
    },
    staff_questions: { type: "array", items: { type: "string" } },
    recommended_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "action_code", "description", "requires_field_confirmation"],
        properties: {
          priority: { type: "integer", minimum: 1 },
          action_code: {
            type: "string",
            enum: [
              "cleaning",
              "adjustment",
              "sealant_check",
              "drainage_check",
              "glass_check",
              "hardware_check",
              "water_test",
              "field_inspection",
              "replacement_estimate",
            ],
          },
          description: { type: "string" },
          requires_field_confirmation: { type: "boolean", const: true },
        },
      },
    },
    summary_for_staff: { type: "string" },
    draft_customer_summary: { type: "string" },
    disclaimer: { type: "string" },
  },
} as const;

export type AnalysisStatus =
  | "completed"
  | "needs_retake"
  | "insufficient_evidence"
  | "invalid_subject";

export type WindowAnalysisResult = {
  schema_version: typeof WINDOW_ANALYSIS_SCHEMA_VERSION;
  analysis_status: AnalysisStatus;
  location: { location_id: string; location_name: string };
  photo_quality: {
    overall: "pass" | "warning" | "fail";
    issues: Array<{ photo_id: string; code: string; description: string }>;
    retake_requests: Array<{ required_category: string; reason: string; instruction: string }>;
  };
  observations: Array<{
    evidence_photo_ids: string[];
    photo_category: string;
    finding_code: string;
    observation: string;
    severity: "none" | "low" | "medium" | "high";
    confidence: number;
    directly_visible: boolean;
    limitation: string;
  }>;
  component_status: Record<"frame" | "glass" | "sealant" | "rail_drainage" | "hardware", "good" | "check" | "suspected_issue" | "undetermined">;
  moisture_assessment: {
    surface_condensation: "none" | "possible" | "visible" | "undetermined";
    insulated_glass_fogging: "none" | "possible" | "visible" | "undetermined";
    water_intrusion_trace: "none" | "possible" | "visible" | "undetermined";
    active_water_visible: boolean;
    cause_confirmed: false;
    possible_causes: Array<{ code: string; label: string; confidence: "low" | "medium" }>;
    limitations: string[];
  };
  overall_level: "good" | "maintenance" | "repair_check" | "expert_check" | "replacement_review" | "undetermined";
  urgent_flags: Array<{ code: string; description: string }>;
  staff_questions: string[];
  recommended_actions: Array<{
    priority: number;
    action_code: string;
    description: string;
    requires_field_confirmation: true;
  }>;
  summary_for_staff: string;
  draft_customer_summary: string;
  disclaimer: string;
};
