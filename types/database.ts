export type ConsultationType =
  | "창호"
  | "종합인테리어"
  | "부분인테리어"
  | "주방"
  | "욕실"
  | "도배"
  | "바닥재"
  | "도어/중문"
  | "기타"
  | "인테리어"; // legacy

export type CustomerStatus =
  | "신규"
  | "미연락"
  | "1차 연락완료"
  | "상담중"
  | "방문예약"
  | "실측예약"
  | "견적작성중"
  | "견적제출"
  | "계약협의"
  | "계약완료"
  | "시공예정"
  | "시공중"
  | "완료"
  | "보류"
  | "연락두절"
  | "취소"
  | "계약"; // legacy (migrated to 계약완료)

export type UserRole = "super_admin" | "admin" | "manager" | "staff";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type InquirySourceType =
  | "online"
  | "sms"
  | "kakao"
  | "lx_headquarters"
  | "other";

export type InquiryProcessStatus =
  | "pending"
  | "parsed"
  | "registered"
  | "ignored";

export type ChecklistType =
  | "신규문의 확인"
  | "1차 해피콜"
  | "상담내용 등록"
  | "방문/실측 일정 확정"
  | "견적서 작성"
  | "견적서 발송"
  | "고객 피드백 확인"
  | "계약 여부 확인"
  | "계약금 확인"
  | "현장 인계";

export type ActivityType =
  | "전화"
  | "문자"
  | "카카오톡"
  | "홈페이지 문의"
  | "LX 본사문의"
  | "방문상담"
  | "실측"
  | "견적발송"
  | "계약협의"
  | "메모"
  | "상태변경"
  | "담당자변경";

export type ContactBucket =
  | "none"
  | "overdue"
  | "today"
  | "soon"
  | "this_week"
  | "later";

export type Team = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Employee = {
  id: string;
  team_id: string | null;
  name: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LeadSource = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  employee_id: string | null;
  role: UserRole;
  permissions: Record<string, boolean>;
  is_active: boolean;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  requested_team?: string | null;
  requested_title?: string | null;
  is_approved?: boolean;
  approval_status?: ApprovalStatus;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileWithEmployee = Profile & {
  employees: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  consultation_type: ConsultationType;
  status: CustomerStatus;
  lead_source_id: string | null;
  assigned_employee_id: string | null;
  consultation_notes: string | null;
  consultation_result?: string | null;
  next_contact_at: string | null;
  last_contact_at?: string | null;
  interest_items: string[];
  desired_timing: string | null;
  special_notes: string | null;
  event_memo: string | null;
  inquiry_raw_text: string | null;
  source_order_no?: string | null;
  source_channel?: string | null;
  source_round?: string | null;
  happy_call_required: boolean;
  happy_call_result: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerChecklist = {
  id: string;
  customer_id: string;
  checklist_type: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CustomerActivity = {
  id: string;
  customer_id: string;
  activity_type: ActivityType | string;
  content: string | null;
  result: string | null;
  next_contact_at: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_assignee_id: string | null;
  new_assignee_id: string | null;
  employee_id: string | null;
  created_by: string | null;
  created_at: string;
  employees?: Pick<Employee, "id" | "name" | "title"> | null;
};

export type CustomerWithRelations = Customer & {
  lead_sources: Pick<LeadSource, "id" | "name"> | null;
  employees: Pick<Employee, "id" | "name" | "title"> | null;
  customer_checklists?: Pick<CustomerChecklist, "id" | "is_completed">[] | null;
  customer_activities?: Pick<CustomerActivity, "id" | "created_at">[] | null;
  checklist_completed?: number;
  checklist_total?: number;
  checklist_rate?: number;
  last_activity_at?: string | null;
  needs_attention?: boolean;
  attention_reasons?: string[];
  contact_bucket?: ContactBucket;
};

export type InquiryMessage = {
  id: string;
  source_type: InquirySourceType;
  raw_text: string;
  parsed_data: ParsedInquiryData;
  customer_id: string | null;
  status: InquiryProcessStatus;
  received_at: string;
  processed_at: string | null;
  created_at: string;
};

export type ParsedInquiryData = {
  name?: string;
  phone?: string;
  address?: string;
  lead_source_name?: string;
  consultation_type?: ConsultationType;
  interest_items?: string[];
  desired_timing?: string;
  special_notes?: string;
  event_memo?: string;
  consultation_notes?: string;
  source_order_no?: string;
  source_channel?: string;
  source_round?: string;
  received_at_text?: string | null;
  consult_room_phone?: string;
  reception_place?: string;
  assigned_employee_id?: string | null;
  status?: CustomerStatus;
  next_contact_at?: string | null;
  happy_call_required?: boolean;
};

/** customers insert/update — live table에 존재하는 컬럼만 */
export type CustomerInsert = {
  name: string;
  phone: string;
  address?: string | null;
  consultation_type?: ConsultationType;
  status?: CustomerStatus;
  lead_source_id?: string | null;
  assigned_employee_id?: string | null;
  consultation_notes?: string | null;
  next_contact_at?: string | null;
  interest_items?: string[];
  desired_timing?: string | null;
  special_notes?: string | null;
  event_memo?: string | null;
  inquiry_raw_text?: string | null;
  source_order_no?: string | null;
  source_channel?: string | null;
  source_round?: string | null;
  happy_call_required?: boolean;
  happy_call_result?: string | null;
};

export type ConsultType =
  | "전화"
  | "방문"
  | "카카오톡"
  | "문자"
  | "이메일"
  | "기타";

export type CustomerConsultLog = {
  id: string;
  customer_id: string;
  consult_type: ConsultType;
  consult_content: string;
  next_contact_date: string | null;
  created_by: string | null;
  created_at: string;
  profiles?: {
    employees: Pick<Employee, "id" | "name" | "title"> | null;
  } | null;
};

export type CustomerListFilters = {
  q?: string;
  employeeId?: string;
  leadSourceId?: string;
  status?: CustomerStatus | "";
  interestItem?: string;
  dateFrom?: string;
  dateTo?: string;
  contact?: "today" | "overdue" | "this_week" | "soon" | "";
  deletedOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type CustomerListResult = {
  customers: CustomerWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DashboardCrmStats = {
  newCount: number;
  noContactCount: number;
  consultingCount: number;
  quoteCount: number;
  contractedCount: number;
  overdueCount: number;
  todayContactCount: number;
  weekContactCount: number;
  byStatus: { status: string; count: number }[];
  byAssignee: {
    employeeId: string | null;
    name: string;
    count: number;
  }[];
};

export type ContactScheduleItem = {
  id: string;
  name: string;
  phone: string;
  status: string;
  assigned_employee_id: string | null;
  next_contact_at: string | null;
  last_contact_at?: string | null;
  contact_bucket: ContactBucket;
};

export type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type QuoteCategory = "창호";

export type QuoteBrand = "LX하우시스" | "홈씨씨" | "기타";

export type QuoteStatus =
  | "작성중"
  | "고객발송"
  | "고객확인"
  | "수정요청"
  | "최종견적"
  | "계약전환"
  | "보류"
  | "취소";

export type QuoteFileType = "pdf" | "xlsx" | "xls";

export type QuoteSendMethod = "문자" | "카카오톡" | "이메일" | "기타";

export type QuoteProviderStatus = "recorded" | "queued" | "sent" | "failed";

export type CustomerQuote = {
  id: string;
  customer_id: string;
  quote_category: QuoteCategory;
  brand: QuoteBrand;
  title: string;
  amount: number | null;
  quote_date: string | null;
  valid_until: string | null;
  assigned_employee_id: string | null;
  file_name: string;
  file_path: string;
  file_type: QuoteFileType;
  file_size: number | null;
  quote_group_id: string;
  version: number;
  parent_quote_id: string | null;
  is_final: boolean;
  status: QuoteStatus;
  notes: string | null;
  linked_contract_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason?: string | null;
  employees?: Pick<Employee, "id" | "name" | "title"> | null;
};

export type CustomerQuoteSend = {
  id: string;
  quote_id: string;
  customer_id: string;
  sent_at: string;
  send_method: QuoteSendMethod;
  recipient: string | null;
  note: string | null;
  provider: string | null;
  provider_status: QuoteProviderStatus;
  provider_message_id: string | null;
  provider_payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type CustomerQuoteInsert = {
  customer_id: string;
  brand: QuoteBrand;
  title: string;
  amount?: number | null;
  quote_date?: string | null;
  valid_until?: string | null;
  assigned_employee_id?: string | null;
  status?: QuoteStatus;
  notes?: string | null;
  parent_quote_id?: string | null;
  quote_group_id?: string | null;
};

/** 신규 견적관리 (public.quotes) */
export type ErpQuoteType = "창호" | "인테리어" | "기타";

export type ErpQuoteMode = "simple" | "detailed";

export type ErpQuoteCostType = "자재" | "시공" | "시공+자재" | "기타";

export type ErpQuoteStatus =
  | "작성중"
  | "검토중"
  | "발송완료"
  | "수정요청"
  | "승인"
  | "계약전환"
  | "만료"
  | "취소";

export type ErpQuoteFileType = "pdf" | "xls" | "xlsx";

export type ErpQuote = {
  id: string;
  customer_id: string;
  project_id: string | null;
  quote_group_id: string;
  parent_quote_id: string | null;
  quote_type: ErpQuoteType | string;
  /** migration 적용 전 환경 호환을 위해 optional */
  quote_mode?: ErpQuoteMode | string;
  title: string;
  quote_number: string | null;
  version_number: number;
  status: ErpQuoteStatus | string;
  total_amount: number;
  discount_amount: number;
  lx_discount_rate?: number;
  lx_discount_amount?: number;
  final_amount: number;
  /**
   * 견적 VAT snapshot. null/undefined = legacy(부가세 미적용).
   * exclusive|inclusive 만 활성. migration 32.
   */
  vat_mode?: string | null;
  /** 저장 시점 부가세율(%). legacy는 null */
  vat_rate?: number | null;
  /** 공급가액(할인 후, 부가세 제외). legacy backfill = final_amount */
  supply_amount?: number;
  /** 부가세액. legacy backfill = 0 */
  vat_amount?: number;
  /** 고객 최종금액(공급가+부가세). legacy backfill = final_amount */
  customer_total_amount?: number;
  valid_until: string | null;
  issued_at: string | null;
  sent_at: string | null;
  sent_by: string | null;
  assigned_employee_id: string | null;
  is_lx_material: boolean;
  is_contract_quote: boolean;
  customer_message: string | null;
  share_token?: string | null;
  memo: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  customers?: Pick<Customer, "id" | "name" | "phone" | "address" | "assigned_employee_id" | "status"> | null;
  employees?: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
  quote_files?: ErpQuoteFile[];
  quote_items?: ErpQuoteItem[];
};

export type ErpQuoteFile = {
  id: string;
  quote_id: string;
  file_type: ErpQuoteFileType | string;
  file_path: string;
  file_name: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  is_primary: boolean;
  uploaded_by: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type ErpQuoteItem = {
  id: string;
  quote_id: string;
  trade_name: string;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number;
  amount: number;
  cost_type?: ErpQuoteCostType | string;
  is_lx_material?: boolean;
  /** 시공+자재 + LX 시 할인 대상 자재금액. 자재 구분은 0이어도 전체 금액 적용 */
  lx_discount_base_amount?: number;
  /** null이면 견적 단위 lx_discount_rate 적용(기존 호환). none|rate|fixed */
  lx_discount_type?: string | null;
  /** rate(%) 또는 정액(원) */
  lx_discount_value?: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type ErpQuoteSendLog = {
  id: string;
  quote_id: string;
  customer_id: string;
  guide_message: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type MaterialSpace =
  | "공통"
  | "현관"
  | "거실"
  | "주방"
  | "안방"
  | "침실"
  | "욕실1"
  | "욕실2"
  | "발코니"
  | "다용도실"
  | "기타";

export type MaterialTrade =
  | "창호"
  | "바닥재"
  | "도배"
  | "타일"
  | "필름"
  | "도어"
  | "중문"
  | "주방가구"
  | "붙박이장"
  | "욕실"
  | "수전"
  | "도기"
  | "샤워부스"
  | "조명"
  | "스위치"
  | "콘센트"
  | "커튼"
  | "블라인드"
  | "에어컨"
  | "환기"
  | "가전"
  | "도장"
  | "목공"
  | "철거"
  | "확장"
  | "전기"
  | "기타";

export type MaterialVersionLabel =
  | "1차 선택안"
  | "수정 1차"
  | "수정 2차"
  | "최종 선택안";

export type MaterialApprovalStatus =
  | "작성중"
  | "승인요청"
  | "승인완료"
  | "변경요청"
  | "보류"
  | "재승인필요"
  | "취소";

export type Project = {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  status: string;
  assigned_employee_id: string | null;
  construction_start_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customers?: Pick<Customer, "id" | "name" | "phone"> | null;
  employees?: Pick<Employee, "id" | "name" | "title"> | null;
};

export type MaterialCategory = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
};

export type MaterialCatalogImage = {
  id: string;
  material_id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  is_cover: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

export type MaterialCatalogItem = {
  id: string;
  category_id: string;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  color: string | null;
  specification: string | null;
  unit: string | null;
  base_price: number;
  supplier: string | null;
  description: string | null;
  internal_memo: string | null;
  cover_image_path: string | null;
  is_favorite: boolean;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  material_categories?: MaterialCategory | null;
  material_catalog_images?: MaterialCatalogImage[];
};

export type ProjectMaterialImage = {
  id: string;
  material_id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  is_cover: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
};

/** @deprecated use ProjectMaterialImage */
export type MaterialImage = ProjectMaterialImage;

export type ProjectMaterialSet = {
  id: string;
  customer_id: string;
  project_id: string;
  title: string;
  version_label: MaterialVersionLabel | string;
  version_number: number;
  status: MaterialApprovalStatus | string;
  is_current: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MaterialOrderStatus =
  | "미발주"
  | "발주대기"
  | "발주완료"
  | "입고완료"
  | "취소";

export type ProjectMaterial = {
  id: string;
  customer_id: string;
  project_id: string | null;
  catalog_material_id: string | null;
  category_id: string;
  space_name: string | null;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  color: string | null;
  specification: string | null;
  application_location: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number;
  additional_price: number;
  supplier: string | null;
  delivery_expected_at: string | null;
  expected_delivery_at?: string | null;
  order_status?: MaterialOrderStatus | string;
  ordered_at?: string | null;
  ordered_by?: string | null;
  delivered_at?: string | null;
  order_note?: string | null;
  note?: string | null;
  staff_note: string | null;
  site_note: string | null;
  cover_image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  material_categories?: MaterialCategory | null;
  project_material_images?: ProjectMaterialImage[];
};

export type ProjectMaterialHistory = {
  id: string;
  project_material_id: string;
  customer_id: string;
  project_id: string | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
};

export type MaterialTemplate = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  material_template_items?: MaterialTemplateItem[];
};

export type MaterialTemplateItem = {
  id: string;
  template_id: string;
  sort_order: number;
  item_data: Record<string, unknown>;
  created_at: string;
};

export type MaterialApprovalVersion = {
  id: string;
  set_id: string;
  project_id: string;
  customer_id: string;
  access_token_id: string | null;
  version_label: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  customer_name: string | null;
  approver_name: string | null;
  agreed_checks: Record<string, unknown>;
  agreed_to_terms: boolean;
  ip_address: string | null;
  user_agent: string | null;
  approved_at: string;
  created_at: string;
};

export type MaterialApproval = {
  id: string;
  material_id: string | null;
  project_id: string;
  customer_id: string;
  action: string;
  status_after: string;
  actor_type: "staff" | "customer" | "system";
  actor_name: string | null;
  actor_user_id: string | null;
  access_token_id: string | null;
  change_reason: string | null;
  desired_product: string | null;
  desired_color: string | null;
  customer_note: string | null;
  reference_image_paths: string[];
  approval_snapshot: Record<string, unknown> | null;
  agreed_to_terms: boolean | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type CustomerAccessToken = {
  id: string;
  token: string;
  customer_id: string;
  project_id: string;
  purpose: string;
  expires_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type MaterialComment = {
  id: string;
  material_id: string;
  project_id: string;
  customer_id: string;
  author_type: "staff" | "customer";
  author_name: string | null;
  author_user_id: string | null;
  access_token_id: string | null;
  body: string;
  created_at: string;
};

export type MaterialApprovalSnapshot = {
  product_name: string;
  brand: string | null;
  model_no: string | null;
  color: string | null;
  spec: string | null;
  apply_location: string | null;
  quantity: number;
  unit: string;
  base_amount: number;
  extra_amount: number;
  staff_description: string | null;
  customer_memo: string | null;
  cover_image_path: string | null;
  image_paths: string[];
  approved_at: string;
  approver_name: string;
};

export type MaterialFavorite = {
  id: string;
  user_id: string;
  trade: MaterialTrade;
  brand: string | null;
  product_name: string;
  model_no: string | null;
  color: string | null;
  spec: string | null;
  unit: string;
  base_amount: number;
  extra_amount: number;
  supplier: string | null;
  staff_description: string | null;
  cover_image_path: string | null;
  source_material_id: string | null;
  created_at: string;
};

export type MaterialChangeRequest = {
  id: string;
  project_id: string;
  customer_id: string;
  set_id?: string | null;
  access_token_id: string | null;
  space_name: MaterialSpace;
  trade: MaterialTrade;
  change_body: string;
  desired_product?: string | null;
  desired_color?: string | null;
  image_paths: string[];
  actor_name: string | null;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type CustomerSchedule = {
  id: string;
  customer_id: string;
  assigned_employee_id: string;
  schedule_type: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  status: string;
  priority: string;
  location: string | null;
  result_note: string | null;
  customer_reaction?: string | null;
  next_action?: string | null;
  next_contact_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  customers?: Pick<
    Customer,
    "id" | "name" | "phone" | "address" | "status"
  > | null;
  employees?: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
};

export type ProjectProcessSchedule = {
  id: string;
  project_id: string | null;
  customer_id: string;
  assigned_employee_id: string | null;
  process_name: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  status: string;
  progress: number;
  contractor_name: string | null;
  contractor_contact: string | null;
  location: string | null;
  dependency_schedule_id: string | null;
  color_key: string | null;
  checklist_note: string | null;
  completion_note: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  customers?: Pick<Customer, "id" | "name" | "phone" | "address"> | null;
  employees?: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
  projects?: Pick<Project, "id" | "name" | "address" | "status" | "construction_start_at"> | null;
};

export type EmployeeTaskPriority = "낮음" | "보통" | "높음" | "긴급";
export type EmployeeTaskStatus = "대기" | "진행중" | "완료" | "취소";

export type EmployeeTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_employee_id: string;
  customer_id: string | null;
  project_id: string | null;
  quote_id: string | null;
  due_at: string | null;
  priority: EmployeeTaskPriority | string;
  status: EmployeeTaskStatus | string;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  customers?: Pick<Customer, "id" | "name" | "phone" | "address"> | null;
  employees?: Pick<Employee, "id" | "name" | "title" | "team_id"> | null;
};
