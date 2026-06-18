export type UserRole = 'admin' | 'dispatcher' | 'customer_service' | 'supervisor';

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Technician {
  id: number;
  name: string;
  phone: string;
  skill: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface ScheduleSlot {
  id: number;
  technician_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export type OrderStatus = 'pending' | 'assigned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface WorkOrder {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  service_type: string;
  description: string;
  status: OrderStatus;
  technician_id: number | null;
  technician_name?: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  cancel_reason: string | null;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderHistory {
  id: number;
  order_id: number;
  action: string;
  operator_id: number;
  operator_name: string;
  remark: string | null;
  created_at: string;
}

export type ApprovalType = 'reassign' | 'force_assign' | 'overtime';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface Approval {
  id: number;
  type: ApprovalType;
  order_id: number;
  order_no?: string;
  customer_name?: string;
  applicant_id: number;
  applicant_name: string;
  reason: string;
  target_technician_id?: number | null;
  status: ApprovalStatus;
  approver_id: number | null;
  approver_name: string | null;
  approval_remark: string | null;
  created_at: string;
  approved_at: string | null;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
}

export type ConflictType = 'time_overlap' | 'overtime';

export type ConflictStatus = 'assigned' | 'confirmed' | 'approval_pending' | 'approval_rejected' | 'resolved';

export interface Conflict {
  id: number;
  order_id: number;
  technician_id: number;
  type: ConflictType;
  description: string;
  resolved: number;
  created_at: string;
  order_no?: string;
  customer_name?: string;
  technician_name?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  order_status?: string;
  conflict_status?: ConflictStatus;
  conflict_status_label?: string;
  approval_id?: number | null;
  approval_status?: ApprovalStatus | null;
  approval_reason?: string | null;
  applicant_name?: string | null;
  approver_name?: string | null;
  approval_remark?: string | null;
  conflict_source?: string;
}

export type ScheduleItemType = 'order_assigned' | 'order_confirmed' | 'order_in_progress' | 'approval_pending' | 'approval_rejected';

export interface TechnicianScheduleItem {
  id: string;
  type: ScheduleItemType;
  source_id: number;
  order_id: number;
  order_no: string;
  customer_name: string;
  technician_id: number;
  technician_name: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: string;
  status_label: string;
  description?: string;
  applicant_name?: string;
  approval_remark?: string;
  created_at: string;
}

export interface ConflictDetail {
  conflict: Conflict;
  overlapping_items: TechnicianScheduleItem[];
  related_order?: WorkOrder;
  related_approval?: Approval;
  available_actions: {
    can_reassign: boolean;
    can_apply_force_assign: boolean;
    can_force_assign: boolean;
    can_approve: boolean;
    can_reject: boolean;
    can_withdraw: boolean;
    requires_approval: boolean;
    approval_reason?: string;
  };
}

export interface AssignCheckResult {
  can_assign: boolean;
  conflicts: ConflictDetail[];
  schedule_items: TechnicianScheduleItem[];
}

export interface DailyReport {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  technicianStats: {
    technicianId: number;
    technicianName: string;
    completedCount: number;
    totalWorkHours: number;
  }[];
}

export type DispatchRuleType = 'max_daily_orders' | 'min_service_interval' | 'required_skill_match';
export type DispatchRuleSeverity = 'block' | 'warn';

export interface DispatchRule {
  id: number;
  name: string;
  type: DispatchRuleType;
  severity: DispatchRuleSeverity;
  value: string;
  enabled: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RulePrecheckItem {
  rule_id: number;
  rule_name: string;
  rule_type: DispatchRuleType;
  severity: DispatchRuleSeverity;
  passed: boolean;
  message: string;
}

export interface RulePrecheckResult {
  can_proceed: boolean;
  has_warnings: boolean;
  items: RulePrecheckItem[];
}

export type RuleOperationType = 'rule_created' | 'rule_updated' | 'rule_enabled' | 'rule_disabled' | 'rule_deleted' | 'rule_hit' | 'rule_overridden' | 'import_success' | 'import_failure';

export interface RuleOperationLog {
  id: number;
  operation_type: RuleOperationType;
  rule_id: number | null;
  operator_id: number;
  operator_name: string;
  detail: string;
  created_at: string;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; reason: string; data: string }[];
}

export type ReturnVisitStatus = 'pending' | 'in_progress' | 'completed' | 'timeout' | 'cancelled';
export type ReturnVisitResult = 'satisfied' | 'dissatisfied' | 'no_answer' | 'invalid_number' | 'refused';
export type AppealStatus = 'pending' | 'accepted' | 'rejected' | 'reassigned' | 'resolved' | 'withdrawn';
export type AfterSaleOperationType =
  | 'config_created' | 'config_updated' | 'config_deleted'
  | 'template_created' | 'template_updated' | 'template_deleted'
  | 'category_created' | 'category_updated' | 'category_deleted'
  | 'visit_created' | 'visit_updated' | 'visit_completed' | 'visit_cancelled'
  | 'appeal_created' | 'appeal_accepted' | 'appeal_rejected'
  | 'appeal_reassigned' | 'appeal_resolved' | 'appeal_withdrawn'
  | 'import_success' | 'import_failure' | 'export_result';

export interface ReturnVisitTemplate {
  id: number;
  name: string;
  content: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface AppealCategory {
  id: number;
  name: string;
  description: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface AfterSaleConfig {
  id: number;
  config_key: string;
  config_value: string;
  description: string;
  updated_at: string;
}

export interface ReturnVisit {
  id: number;
  order_id: number;
  order_no?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  service_type?: string;
  template_id: number | null;
  template_name?: string;
  status: ReturnVisitStatus;
  result: ReturnVisitResult | null;
  remark: string | null;
  image_required: number;
  image_url: string | null;
  timeout_hours: number;
  initiator_id: number;
  initiator_name: string;
  handler_id: number | null;
  handler_name: string | null;
  initiated_at: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReturnVisitHistory {
  id: number;
  visit_id: number;
  action: string;
  operator_id: number;
  operator_name: string;
  remark: string | null;
  created_at: string;
}

export interface Appeal {
  id: number;
  visit_id: number;
  order_id: number;
  order_no?: string;
  customer_name?: string;
  category_id: number;
  category_name?: string;
  status: AppealStatus;
  reason: string;
  image_url: string | null;
  image_required: number;
  submitter_id: number;
  submitter_name: string;
  handler_id: number | null;
  handler_name: string | null;
  handle_remark: string | null;
  timeout_hours: number;
  submitted_at: string;
  due_at: string;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppealHistory {
  id: number;
  appeal_id: number;
  action: string;
  operator_id: number;
  operator_name: string;
  remark: string | null;
  created_at: string;
}

export interface AfterSaleOperationLog {
  id: number;
  operation_type: AfterSaleOperationType;
  related_id: number | null;
  related_type: string | null;
  operator_id: number;
  operator_name: string;
  detail: string;
  created_at: string;
}

export interface ReturnVisitDetail {
  visit: ReturnVisit;
  histories: ReturnVisitHistory[];
  appeals: Appeal[];
  available_actions: {
    can_edit: boolean;
    can_complete: boolean;
    can_cancel: boolean;
    can_submit_appeal: boolean;
  };
}

export interface AppealDetail {
  appeal: Appeal;
  histories: AppealHistory[];
  visit?: ReturnVisit;
  available_actions: {
    can_accept: boolean;
    can_reject: boolean;
    can_reassign: boolean;
    can_resolve: boolean;
    can_withdraw: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ==================== 售后知识库与处理预案 ====================

export type KnowledgeStatus = 'draft' | 'pending_review' | 'published' | 'disabled' | 'archived';
export type KnowledgeEffectiveness = 'helpful' | 'partially_helpful' | 'not_helpful';

export type KnowledgeOperationType =
  | 'category_created' | 'category_updated' | 'category_deleted'
  | 'knowledge_created' | 'knowledge_updated' | 'knowledge_submitted'
  | 'knowledge_approved' | 'knowledge_rejected' | 'knowledge_published'
  | 'knowledge_disabled' | 'knowledge_rollback' | 'knowledge_archived'
  | 'version_created' | 'hit_recorded' | 'feedback_submitted'
  | 'config_updated' | 'import_success' | 'import_failure' | 'export_result';

export interface KnowledgeCategory {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntry {
  id: number;
  title: string;
  question: string;
  answer: string;
  applicable_products: string;
  escalation_condition: string;
  escalation_threshold: number;
  category_id: number;
  category_name?: string;
  current_version_id: number | null;
  latest_version_id: number | null;
  status: KnowledgeStatus;
  hits: number;
  helpful_count: number;
  version: number;
  review_remark: string | null;
  expires_at: string | null;
  tags: string;
  created_by: number;
  created_by_name?: string;
  published_by: number | null;
  published_by_name?: string | null;
  disabled_by: number | null;
  disabled_by_name?: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  disabled_at: string | null;
  updated_at: string;
}

export interface KnowledgeVersion {
  id: number;
  entry_id: number;
  version_no: number;
  title: string;
  question: string;
  answer: string;
  applicable_products: string;
  escalation_condition: string;
  escalation_threshold: number;
  category_id: number;
  status: KnowledgeStatus;
  change_log: string;
  expires_at: string | null;
  tags: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
}

export interface KnowledgeHitRecord {
  id: number;
  entry_id: number;
  entry_title?: string;
  version_id: number;
  version_no?: number;
  order_id: number;
  order_no?: string;
  category_id: number;
  category_name?: string;
  matched_by: string;
  matched_keywords: string;
  score: number;
  used: number;
  effectiveness: KnowledgeEffectiveness | null;
  feedback: string | null;
  operator_id: number;
  operator_name: string;
  created_at: string;
  used_at: string | null;
  feedback_at: string | null;
}

export interface KnowledgeOperationLog {
  id: number;
  operation_type: KnowledgeOperationType;
  related_id: number | null;
  related_type: string | null;
  operator_id: number;
  operator_name: string;
  detail: string;
  created_at: string;
}

export interface KnowledgeConfig {
  id: number;
  config_key: string;
  config_value: string;
  description: string;
  updated_at: string;
}

export interface KnowledgeEntryDetail {
  entry: KnowledgeEntry;
  versions: KnowledgeVersion[];
  hit_records: KnowledgeHitRecord[];
  available_actions: {
    can_edit: boolean;
    can_submit: boolean;
    can_approve: boolean;
    can_reject: boolean;
    can_publish: boolean;
    can_disable: boolean;
    can_rollback: boolean;
    can_delete: boolean;
  };
}

export interface KnowledgeMatchResult {
  entry: KnowledgeEntry;
  matched_keywords: string[];
  score: number;
  matched_by: string;
}

export interface KnowledgeQueryParams {
  status?: KnowledgeStatus;
  category_id?: number;
  created_by?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
}
